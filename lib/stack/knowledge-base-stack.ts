import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { AuroraServerless } from "../constructs/aurora-serverless";
import { Network } from "../constructs/network";
import { KnowledgeBase } from "../constructs/knowledge-base";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";

interface KnowledgeBaseStackProps extends StackProps {
  envName: string;
  fa2BackendFunction: NodejsFunction;
  fa2ReactLambda?: NodejsFunction; // ReACT版FA2のLambda関数を追加
  embeddingModelId?: string;
  rerankModelId?: string;
}

export class KnowledgeBaseStack extends Stack {
  constructor(scope: Construct, id: string, props: KnowledgeBaseStackProps) {
    super(scope, id, props);

    const network = new Network(this, 'Network', {
      vpcCidr: "10.0.0.0/16"
    })
    const auroraServerless = new AuroraServerless(this, 'AuroraServerless', {
      vpc: network.vpc,
    });
    
    // knowledge base with Aurora Serverless
    const knowledgeBase = new KnowledgeBase(this, 'KnowledgeBase', {
      envName: props.envName,
      embeddingModelId: props.embeddingModelId ? props.embeddingModelId : 'amazon.titan-embed-text-v2:0',
      dimensions: 1536,
      cluster: auroraServerless.cluster,
      credentialSecretArn: auroraServerless.secretArn,
    })
    knowledgeBase.node.addDependency(auroraServerless.cluster);
    props.fa2BackendFunction.addEnvironment("KNOWLEDGEBASE_ID", knowledgeBase.knowledgeBaseId);
    
    // ReACT版FA2のLambda関数にも環境変数を設定
    if (props.fa2ReactLambda) {
      props.fa2ReactLambda.addEnvironment("KNOWLEDGEBASE_ID", knowledgeBase.knowledgeBaseId);
    }

    // add permissions to fa2 backend function
    props.fa2BackendFunction.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'bedrock:Retrieve',
        ],
        resources: [`arn:aws:bedrock:${Stack.of(this).region}:${Stack.of(this).account}:knowledge-base/${knowledgeBase.knowledgeBaseId}`],
      })
    );
    
    // ReACT版FA2のLambda関数にも権限を追加
    if (props.fa2ReactLambda) {
      props.fa2ReactLambda.addToRolePolicy(
        new PolicyStatement({
          actions: [
            'bedrock:Retrieve',
          ],
          resources: [`arn:aws:bedrock:${Stack.of(this).region}:${Stack.of(this).account}:knowledge-base/${knowledgeBase.knowledgeBaseId}`],
        })
      );
    }

    if (props.rerankModelId) {
      props.fa2BackendFunction.addEnvironment("RERANK_MODEL_ID", props.rerankModelId);
      props.fa2BackendFunction.addToRolePolicy(
        new PolicyStatement({
          actions: [
            'bedrock:Rerank',
          ],
          resources: ['*'],
        })
      );
      props.fa2BackendFunction.addToRolePolicy(
        new PolicyStatement({
          actions: [
            'bedrock:InvokeModel'
          ],
          resources: ['*'],
        })
      );
      
      // ReACT版FA2のLambda関数にも環境変数と権限を追加
      if (props.fa2ReactLambda) {
        props.fa2ReactLambda.addEnvironment("RERANK_MODEL_ID", props.rerankModelId);
        props.fa2ReactLambda.addToRolePolicy(
          new PolicyStatement({
            actions: [
              'bedrock:Rerank',
            ],
            resources: ['*'],
          })
        );
        props.fa2ReactLambda.addToRolePolicy(
          new PolicyStatement({
            actions: [
              'bedrock:InvokeModel'
            ],
            resources: ['*'],
          })
        );
      }
    }
  }
}
