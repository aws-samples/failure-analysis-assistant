import _ from "lodash";

export const createPromptJa = (props: {
  errorDescription: string;
  applicationLogs?: string;
  albAccessLogs?: string;
  cloudTrailLogs?: string;
  xrayTraces?: string;
}) => {
  const {
    errorDescription,
    applicationLogs,
    albAccessLogs,
    cloudTrailLogs,
    xrayTraces,
  } = props;
  let prompt = `AWS上で稼働するワークロードを監視・運用するエージェントです。必ず日本語で回答してください。
    あなたが担当するワークロードは、CloudFront、ALB、ECS on EC2、DynamoDBで構成されており、ECS on EC2上にSpringアプリケーションがデプロイされています。
    現在、運用管理者から ${errorDescription} という事象が発生したとの連絡がありました。
    あなたは、<logs>タグに与えられたログを確認し、発生した事象の根本原因を推測してください。
    根本原因を記述する際に、参考にしたログの内容についても記載し、運用管理者が実際のログを確認しやすくしてください。
    <logs>
      <ApplicationLogs>${applicationLogs}</ApplicationLogs>
    `;
  prompt += albAccessLogs
    ? `<ALBAccessLogs>${albAccessLogs}</ALBAccessLogs>`
    : "";

  prompt += cloudTrailLogs
    ? `<CloudTrailLogs>${cloudTrailLogs}</CloudTrailLogs>`
    : "";

  prompt += xrayTraces ? `<XrayTraces>${xrayTraces}</XrayTraces>` : "";

  prompt += `
    </logs>
    発生した事象の根本原因 : `;
  return prompt;
};

export const createPromptEn = (props: {
  errorDescription: string;
  applicationLogs?: string;
  albAccessLogs?: string;
  cloudTrailLogs?: string;
  xrayTraces?: string;
}) => {
  const {
    errorDescription,
    applicationLogs,
    albAccessLogs,
    cloudTrailLogs,
    xrayTraces,
  } = props;
  let prompt = `You are an agent that monitors and operates workloads running on AWS.
    The workload you are responsible for consists of CloudFront, ALB, ECS on EC2, and DynamoDB, and applications that made by Spring Framework are deployed on ECS on EC2.
    Currently, the operations manager has informed us that an event called ${errorDescription.replace(
      /\+/g,
      " ",
    )} has occurred.
    You should check the <logs> tags, Based on logs sandwiched between tags, the root cause of the event that occurred is inferred.
    When describing the root cause, please also describe the contents of the log you referred to, making it easier for operator to check the actual logs.
    <logs>
      <ApplicationLogs>${applicationLogs}</ApplicationLogs>
    `;
  prompt += albAccessLogs
    ? `<ALBAccessLogs>${albAccessLogs}</ALBAccessLogs>`
    : "";

  prompt += cloudTrailLogs
    ? `<CloudTrailLogs>${cloudTrailLogs}</CloudTrailLogs>`
    : "";

  prompt += xrayTraces ? `<XrayTraces>${xrayTraces}</XrayTraces>` : "";

  prompt += `
    </logs>
    Root causes list that you thought: `;
  return prompt;
};

export function getStringValueFromQueryResult(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryResult: any[],
  key: string,
): string | undefined {
  return JSON.stringify(
    _.get(_.find(_.flatMap(queryResult), { key: key }), "value"),
  );
}
