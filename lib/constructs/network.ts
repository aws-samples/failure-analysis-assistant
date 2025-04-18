import {
  aws_ec2 as ec2,
  aws_s3 as s3,
  RemovalPolicy,
  Stack,
} from "aws-cdk-lib";
import { IpAddresses } from "aws-cdk-lib/aws-ec2";
import { NagSuppressions } from "cdk-nag/lib";
import { Construct } from "constructs";

export interface NetworkProps {
  vpcCidr: string;
}

export class Network extends Construct {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: NetworkProps) {
    super(scope, id);

    const vpc = new ec2.Vpc(this, "Vpc", {
      ipAddresses: IpAddresses.cidr(props.vpcCidr),
      maxAzs: 2,
      flowLogs: {},
      subnetConfiguration: [
        {
          cidrMask: 22,
          name: "Protected",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    const flowLogBucket = new s3.Bucket(this, "FlowLogBucket", {
      accessControl: s3.BucketAccessControl.PRIVATE,
      encryption: s3.BucketEncryption.KMS,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN,
      enforceSSL: true,
    });

    vpc.addFlowLog("FlowLogs", {
      destination: ec2.FlowLogDestination.toS3(flowLogBucket),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });
    this.vpc = vpc;

    const secretsManagerEndpoint = vpc.addInterfaceEndpoint("SecretsManagerEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });
    secretsManagerEndpoint.connections.allowFromAnyIpv4(ec2.Port.tcp(443));
    vpc.addInterfaceEndpoint("BedrockRuntimeEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });

    NagSuppressions.addResourceSuppressions(flowLogBucket, [
      {
        id: "AwsSolutions-S1",
        reason: "No needs logging for log bucket."
      }
    ]);
    NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), `/${Stack.of(this).stackName}/Network/FlowLogBucket/Key/Resource`, 
      [{
          id: 'AwsSolutions-KMS5',
          reason: 'Deletion protection is disabled to make sure a customer can stop incurring charges if they want to delete the construct.',
      }], 
    true);
  }
}
