import {
  CustomResource,
  Duration,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_rds as rds,
  Stack,
} from 'aws-cdk-lib';
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag/lib/nag-suppressions";
import { CfnDBCluster } from 'aws-cdk-lib/aws-rds';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as path from 'node:path';

interface DatabaseProperties {
  SecretName: string;
  DatabaseName: string;
  VectorDimensions: number;
  TableName: string;
  PrimaryKeyField: string;
  SchemaName: string;
  VectorField: string;
  TextField: string;
  MetadataField: string;
}

interface AuroraServerlessProps {
  vpc: ec2.Vpc;
}

export class AuroraServerless extends Construct {
  public readonly secretArn: string;
  public readonly cluster: rds.DatabaseCluster;
  constructor(scope: Construct, id: string, props: AuroraServerlessProps ) {
    super(scope, id);
    
    const secret = rds.Credentials.fromGeneratedSecret('postgres', {
      secretName: `aurora-secret-${Stack.of(this).stackName.toLocaleLowerCase()}`,
    });

    // Security Group
    const auroraSG = new ec2.SecurityGroup(this, 'AuroraSecurityGroup', {
      vpc: props.vpc,
    })

    // Create the serverless cluster, provide all values needed to customise the database.
    const cluster = new rds.DatabaseCluster(this, 'PgVectorCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_5,
      }),
      credentials: secret,
      vpc: props.vpc,
      vpcSubnets: {
        subnets: props.vpc.isolatedSubnets,
      },
      securityGroups: [auroraSG],
      defaultDatabaseName: 'bedrock_vector_db',
      storageEncrypted: true,
      writer: rds.ClusterInstance.serverlessV2('AuroraServerlessWriter'),
      // reader インスタンスはオプション
      // readers: [rds.ClusterInstance.serverlessV2('AuroraServerlessReader', { scaleWithWriter: true })],
      serverlessV2MaxCapacity: 1.0,
      serverlessV2MinCapacity: 0.5,
    })
    this.cluster = cluster;
    this.secretArn = cluster.secret!.secretFullArn!;

    // add secret rotation
    cluster.addRotationSingleUser();
    const cfnDbCluster = cluster.node.defaultChild as CfnDBCluster;
    cfnDbCluster.addOverride('Properties.EnableHttpEndpoint', true);

    const lambdaFunction = new NodejsFunction(this, "OnEventHandler", {
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      timeout: Duration.seconds(60),
      runtime: Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../lambda/functions/custom-resource-for-pgvector/index.ts"),
      handler: "handler",
      initialPolicy: [
        new iam.PolicyStatement({
          actions: [
            'ec2:DescribeInstances',
            'ec2:CreateNetworkInterface',
            'ec2:AttachNetworkInterface',
            'ec2:DescribeNetworkInterfaces',
            'autoscaling:CompleteLifecycleAction',
            'ec2:DeleteNetworkInterface',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: [
            'rds:DescribeDBClusters', 
            'rds-data:ExecuteStatement',
            'rds-data:BatchExecuteStatement'
          ],
          resources: [cluster.clusterArn],
        }),
        new iam.PolicyStatement({
          actions: ["secretsmanager:DescribeSecret", "secretsmanager:GetSecretValue"],
          resources: [cluster.secret!.secretFullArn!]
        })
      ],
    });
    auroraSG.addIngressRule(lambdaFunction.connections.securityGroups[0], ec2.Port.tcp(5432));

    const provider = new cr.Provider(this, "CustomResourceProvider", {
      onEventHandler: lambdaFunction,
    });
    const customResource = new CustomResource(this, "CustomResource", {
      serviceToken: provider.serviceToken,
      properties: {
        SecretName: secret.secretName,
        DatabaseName: 'bedrock_vector_db',
        VectorDimensions: 1536,
        TableName: 'bedrock_kb',
        PrimaryKeyField: 'id',
        SchemaName:'bedrock_integration', 
        VectorField: 'embedding',
        TextField: 'chunks',
        MetadataField: 'metadata' 
      } as DatabaseProperties,
    });
    customResource.node.addDependency(cluster);

    NagSuppressions.addResourceSuppressions(cluster, 
      [{
        id: 'AwsSolutions-RDS6',
        reason: 'Use password authentication as an exception to simplify implementation.',
      },
      {
        id: 'AwsSolutions-RDS10',
        reason: 'Deletion protection is disabled to make sure a customer can stop incurring charges if they want to delete the construct.',
      }], 
    true);
    NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), `/${Stack.of(this).stackName}/AuroraServerless/OnEventHandler/ServiceRole/Resource`, 
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Suppress AwsSolutions-IAM4 for custom resource lambda function.',
        },
      ],
    true);
    NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), `/${Stack.of(this).stackName}/AuroraServerless/OnEventHandler/ServiceRole/DefaultPolicy/Resource`, 
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Suppress AwsSolutions-IAM4 for custom resource lambda function.',
        },
      ],
    true);
    NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), `/${Stack.of(this).stackName}/AuroraServerless/CustomResourceProvider/framework-onEvent/ServiceRole/Resource`, 
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Suppress AwsSolutions-IAM4 for custom resource lambda function.',
        },
      ],
    true);
    NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), `/${Stack.of(this).stackName}/AuroraServerless/CustomResourceProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource`, 
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Suppress AwsSolutions-IAM4 for custom resource lambda function.',
        },
      ],
    true);
  }
}