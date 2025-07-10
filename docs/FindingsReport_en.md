# Findings Report Feature

The Findings Report is a feature that collects detection results (Findings) from AWS SecurityHub and GuardDuty to provide a comprehensive analysis of security status. This feature allows you to quickly identify security issues and take appropriate measures.

## Key Features

1. **Integration of Multiple Security Sources**
   - Collects and analyzes findings from AWS SecurityHub
   - Collects and analyzes findings from Amazon GuardDuty
   - Potential for future integration with AWS Health information

2. **Comprehensive Security Analysis**
   - Holistically analyzes collected findings
   - Prioritizes issues based on severity and impact
   - Groups related findings to identify fundamental problems

3. **Detailed Report Generation**
   - Generates analysis results as a PDF report
   - Provides overview and detailed explanation of detected issues
   - Includes recommended actions and remediation procedures

## How to Use

You type `/findings-report` in the Slack chat section and send it, a message indicating that the request has been accepted will be displayed.
In about 1-2 minutes, a PDF of the Findings report will be uploaded.

![findings-report](./docs/images/en/fa2-findings-report.png)

## Technical Mechanism

1. Use AWS SecurityHub and GuardDuty APIs to retrieve the latest findings
2. Organize the retrieved findings in JSON format
3. Use Bedrock LLM to analyze the findings and generate a comprehensive report
4. Convert the generated Markdown content to PDF
5. Send the PDF file to the Slack channel

## Configuration

To enable the Findings Report feature, configure the following in the `parameter.ts` file:

```typescript
export const devParameter: AppParameter = {
  // Other settings...
  slashCommands: {
    findingsReport: true,  // Enable Findings Report
    // Other settings...
  },
  // Other settings...
};
```

### [Optional] Slack App Configuration for Findings Report Feature

1. Click on [Slash Commands] in the left menu, then click [Create New Command]
2. Enter the values as shown in the table below, and click [Save] when you have entered them all

   | Item Name | Value |
   | --------- | ----- |
   | Command | /findings-report |
   | Request URL | Same URL as the Request URL |
   | Short Description | Create report about findings of Security Hub and GuardDuty |

3. **Note**: If you have already enabled the Metrics Analysis Support feature, the following steps are not necessary
4. Click on [App Home] in the left menu, and check [Allow users to send Slash commands and messages from the messages tab] in the [Message Tab] section
5. Click on [OAuth & Permissions] in the left menu, and add `commands` in the [Scopes] section

## Implementation Details

The Findings Report feature consists of the following main components:

1. **Lambda Function**: `lambda/functions/findings-report/main.mts`
   - Retrieves findings from SecurityHub and GuardDuty
   - Integrates Bedrock service and PDF conversion functionality

2. **Security Service Integration**:
   - `lambda/lib/aws/services/securityhub-service.ts`: Retrieves findings from SecurityHub
   - `lambda/lib/aws/services/guardduty-service.ts`: Retrieves findings from GuardDuty

3. **PDF Conversion**: `lambda/lib/puppeteer.ts`
   - Converts Markdown content to high-quality PDF
   - Includes support for various fonts

4. **Prompt Generation**: `lambda/lib/prompt.ts`
   - Generates prompts to send to the LLM
   - Provides specialized prompts for security findings analysis and report creation

