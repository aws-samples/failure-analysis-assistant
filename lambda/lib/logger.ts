import { Logger } from "@aws-lambda-powertools/logger";

const logger = new Logger({ serviceName: "FA2" });

export default logger;