import {
  aws_iam as iam, 
  aws_bedrock as bedrock,
  Stack
} from "aws-cdk-lib";
import { DatabaseCluster } from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";
import { Bucket } from "./bucket";
import { NagSuppressions } from "cdk-nag/lib";

interface KnowledgeBaseProps {
  envName: string;
  embeddingModelId: string;
  dimensions: number;
  cluster: DatabaseCluster;
  credentialSecretArn: string;
}

export class KnowledgeBase extends Construct {
  public readonly knowledgeBaseId: string;
  constructor(scope: Construct, id: string, props: KnowledgeBaseProps) {
    super(scope, id);

    const datasourceBucket = new Bucket(this, "DataSourceBucket");

    const executionRole = new iam.Role(this, 'Role', {
      roleName: `AmazonBedrockExecutionRoleForKnowledgeBase_${props.envName}${Stack.of(this).stackName}`.slice(0,63),
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com', {
        conditions: {
          StringEquals: {
            "aws:SourceAccount": `${Stack.of(this).account}`
          },
          ArnLike: {
            "AWS:SourceArn": `arn:aws:bedrock:${Stack.of(this).region}:${Stack.of(this).account}:knowledge-base/*`
          }
        }
      }),
      inlinePolicies: {
        invokeModel: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['bedrock:InvokeModel'],
              resources: [`arn:aws:bedrock:${Stack.of(this).region}::foundation-model/${props.embeddingModelId}`],
            })
          ]
        }),
        rds: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'rds:DescribeDBClusters',
              ],
              resources: [
                `arn:aws:rds:${Stack.of(this).region}:${Stack.of(this).account}:cluster:${props.cluster.clusterIdentifier}`,
              ]
            }),
            new iam.PolicyStatement({
              actions: [
                'rds-data:ExecuteStatement',
                'rds-data:BatchExecuteStatement',
              ],
              resources: [
                `arn:aws:rds:${Stack.of(this).region}:${Stack.of(this).account}:cluster:${props.cluster.clusterIdentifier}`,
              ]
            }),
            new iam.PolicyStatement({
              actions: ["secretsmanager:GetSecretValue"],
              resources: [props.credentialSecretArn]
            })
          ]
        })
      }
    });
    // Access grant to Datasource bucket from knowledge base
    datasourceBucket.bucket.grantReadWrite(executionRole);

    const cfnKnowledgeBase = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', {
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${Stack.of(this).region}::foundation-model/${props.embeddingModelId}`,
        },
      },
      name: `${props.envName.slice(0,3)}-fa2-knowledge-base`,
      roleArn: executionRole.roleArn,
      storageConfiguration: {
        type: 'RDS',
        rdsConfiguration: {
          credentialsSecretArn: props.credentialSecretArn,
          databaseName: 'bedrock_vector_db',
          fieldMapping: {
            metadataField: 'metadata',
            primaryKeyField: 'id',
            textField: 'chunks',
            vectorField: 'embedding',
          },
          resourceArn: `arn:aws:rds:${Stack.of(this).region}:${Stack.of(this).account}:cluster:${props.cluster.clusterIdentifier}`,
          tableName: 'bedrock_integration.bedrock_kb',
        },
      },
    });
    cfnKnowledgeBase.node.addDependency(props.cluster);
    this.knowledgeBaseId = cfnKnowledgeBase.attrKnowledgeBaseId;

    new bedrock.CfnDataSource(this, 'DataSource', {
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: datasourceBucket.bucket.bucketArn,
        },
      },
      knowledgeBaseId: cfnKnowledgeBase.attrKnowledgeBaseId,
      name: `${props.envName.slice(0,3).toLocaleLowerCase()}-fa2-datasoruce`,
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: 'FIXED_SIZE',
          fixedSizeChunkingConfiguration: {
            maxTokens: 300,
            overlapPercentage: 30,
          },
        },
      },
    });

    NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), `/${Stack.of(this).stackName}/KnowledgeBase/Role/DefaultPolicy/Resource`, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Allow to access to RDS Cluster and Datasource bucket',
        appliesTo: [
          `Action::s3:Abort*`,
          `Action::s3:DeleteObject*`,
          `Action::s3:GetObject*`,
          `Action::s3:GetBucket*`,
          `Action::s3:List*`,
          {regex: '/^Resource::.*KnowledgeBaseDataSourceBucketDataSourceBucketBucket.*.Arn/g'},
        ]
      } 
    ])
    NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), `/${Stack.of(this).stackName}/KnowledgeBase/Role/Resource`, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Allow to access to RDS Cluster and Datasource bucket',
        appliesTo: [
          'Resource::arn:aws:secretsmanager:*:*:secret:aurora-secret/*',
        ]
      } 
    ])
  }
}
