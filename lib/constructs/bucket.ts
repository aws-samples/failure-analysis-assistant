import * as aws_s3 from "aws-cdk-lib/aws-s3";
import { RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";

export class Bucket extends Construct {
  public readonly bucket: aws_s3.Bucket;
  constructor(scope: Construct, id: string) {
    super(scope, id);
    const accessLogBucket = new aws_s3.Bucket(this, `${id}AccessLogBucket`, {
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL,
      encryption: aws_s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects: true,
    });
    this.bucket = new aws_s3.Bucket(this, `${id}Bucket`, {
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL,
      encryption: aws_s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      serverAccessLogsBucket: accessLogBucket,
      autoDeleteObjects: true,
    });
  }
}
