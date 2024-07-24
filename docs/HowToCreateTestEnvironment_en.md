# How to create a test environment for FA2

For those who want to try FA2 but find it difficult to introduce FA2 into an existing environment, even in a development environment,
As a method to deploy a workload to run FA2 as a trial, We will describe how to build using a guest application sample in the [Baseline Environment on AWS (BLEA)](https://github.com/aws-samples/baseline-environment-on-aws/tree/main) repository.

The slack notifications of AWS Chatbot alarm and the monitoring by CloudWatch Synthetics are implemented in this guest application sample.
So, you can prepare the environment to trial FA2.

1. Clone [BLEA](https://github.com/aws-samples/baseline-environment-on-aws/tree/main)
2. Update `baseline-environment-on-aws/usecases/blea-guest-ecs-app-sample/parameter.ts` in the cloned repository
   ```
   export const devParameter: appParameter = {
     env: {
       //account: '111111111111',
       region: 'ap-northeast-1', //match the region where FA2 will be deployed
     },
     envName: 'Development',
     monitoringNotifyEmail: 'notify-security@example.com', // Set an email address where notification emails can be sent, such as your own email
     monitoringSlack workspaceId: 'TXXXXXXXXXX', // set your own Slack workspace ID
     monitoringSlack channelId: 'CYYYYYYYY', // Set the channel ID of the channel you want to send notifications to in your Slack workspace
     vpcCidr: '10.100.0.0/16', // Change it only if you want to change it
     dashboardName: 'blea-ecs-app-sample', // Change it only if you want to change it
 
     //We don't use a custom domain, so there's no problem leaving it as is
     //-- Sample to use custom domain on CloudFront
     //hostedZoneId: 'Z00000000000000000000',
     //domainName: 'example.com',
     //cloudFrontHostName: 'www',
   };
   ```

3. Update the value of `datapointsToAlarm` of `CanaryFailedAlarm` to `1` in `baseline-environment-on-aws/usecases/blea-guest-ecs-app-sample/lib/constructs/canary.ts`
   1. According to this modification, the status of canary alarm will be alart, when ECS tasks are terminated forcibly.
4. Deploy the CDK
   1. `$ cd baseline-environment-on-aws/usecases/blea-guest-ecs-app-sample`
   2. `$ npm install`
   3. `$ npx cdk bootstrap --profile {profile_name} `
   4. `$ npx cdk deploy --all --profile {profile_name} `
5. Forcibly terminate all running ECS tasks and check if an alert comes in Slack. When the alert comes, the setting is complete
6. After deploying FA2, raise the alert again and try FA2's failure analysis.

## Notes

If you met the error `Invalid Request Provided: Deprecated runtime version specified` during deployment, the `puppeteer` runtime version used in `Canary` is out of date.
Change `runtime:synthetics.runtime.synthetics_nodejs_puppeteer_6_0`in `baseline-environment-on-aws/usecases/blea-guest-ecs-app-sample/lib/constructs/canary.ts` to an available version.
For information on available versions, see [Runtime versions using Node.js and Puppeteer](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Synthetics_Library_nodejs_puppeteer.html).