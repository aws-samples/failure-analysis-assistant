import * as aws from 'aws-sdk';
import { Connection } from 'postgrejs';

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

interface BaseEvent {
  RequestId : string;
  ResponseURL : string;
  ResourceType : string;
  LogicalResourceId : string;
  StackId : string;
}

interface DeleteEvent extends BaseEvent {
  RequestType : "Delete";
  PhysicalResourceId : string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ResourceProperties : {[key:string]: any};
}

interface CreateEvent extends BaseEvent {
  RequestType : "Create";
  ResourceProperties : DatabaseProperties;
}

interface UpdateEvent extends BaseEvent {
  RequestType : "Update";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ResourceProperties : {[key:string]: any};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  oldResourceProperties: { [key:string]: any };
}

interface RdsSecret {
  host: string;
  port: number;
  username: string;
  password: string;
  dbname: string;
}

async function getSecret(secretName: string): Promise<RdsSecret> {
  const client = new aws.SecretsManager();
  try {
    const data = await client.getSecretValue({ SecretId: secretName }).promise();
    if ('SecretString' in data && data.SecretString != null) {
      return JSON.parse(data.SecretString);
    } else {
      throw new Error("Couldn't parse the secret.");
    }
  } catch (error) {
    throw new Error(`Couldn't retrieve the secret: ${JSON.stringify(error)}`);
  }
}

async function connectToDatabase(secret: RdsSecret ) {
  console.log("connecting to rds", JSON.stringify(secret));
  try {
    const connection = new Connection({
      host: secret.host,
      port: secret.port,
      database: secret.dbname,
      user: secret.username,
      password: secret.password,
      ssl: {
        rejectUnauthorized: false,
      },
    });
    await connection.connect();
    return connection;
  } catch (error) {
    throw new Error("Couldn't connect to the database: " + JSON.stringify(error));
  }
}

async function executeSqlCommands(
  connection: Connection,
  password: string,
  vectorDimensions: number,
  tableName: string,
  pkField: string,
  schemaName: string,
  vectorField: string,
  textField: string,
  metadataField: string
) {
  try {
    await connection.query("CREATE EXTENSION IF NOT EXISTS vector;");

    await connection.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName};`);

    await connection.query(`
      DO $$
      BEGIN
      CREATE ROLE bedrock_user WITH LOGIN PASSWORD '${password}';
      EXCEPTION WHEN duplicate_object THEN RAISE NOTICE '%, moving to next statement', SQLERRM USING ERRCODE = SQLSTATE;
      END
      $$`);

    await connection.query(`GRANT ALL ON SCHEMA ${schemaName} TO bedrock_user;`);

    await connection.query(
      `CREATE TABLE IF NOT EXISTS ${schemaName}.${tableName} (
        ${pkField} uuid PRIMARY KEY,
        ${vectorField} vector(${vectorDimensions}),
        ${textField} text,
        ${metadataField} json
      );`
    );

    await connection.query(
      `CREATE INDEX IF NOT EXISTS ${vectorField}_idx ON ${schemaName}.${tableName} 
      USING hnsw (${vectorField} vector_cosine_ops);`
    );

    await connection.query(
      `CREATE INDEX IF NOT EXISTS ${textField}_gin_idx ON ${schemaName}.${tableName} 
      USING gin (to_tsvector('simple', ${textField}));`
    )

  } catch (error) {
    throw new Error("Error executing SQL commands: " + JSON.stringify(error));
  } finally {
    await connection.close();
  }
}

async function onCreate(event: CreateEvent) {
  const secretName = event.ResourceProperties.SecretName;
  const dbName = event.ResourceProperties.DatabaseName;
  const vectorDimensions = event.ResourceProperties.VectorDimensions;
  const tableName = event.ResourceProperties.TableName;
  const primaryKeyField = event.ResourceProperties.PrimaryKeyField;
  const schemaName = event.ResourceProperties.SchemaName;
  const vectorField = event.ResourceProperties.VectorField;
  const textField = event.ResourceProperties.TextField;
  const metadataField = event.ResourceProperties.MetadataField;

  const secret = await getSecret(secretName);
  const connection = await connectToDatabase(secret);
  await executeSqlCommands(
    connection,
    secret.password,
    vectorDimensions,
    tableName,
    primaryKeyField,
    schemaName,
    vectorField,
    textField,
    metadataField
  );

  return {
    PhysicalResourceId: `${secretName}-${dbName}`,
    Data: {
        Message: "Database setup completed successfully."
    }
  };
}

function onUpdate(_event: UpdateEvent) {
  console.log(`OnUpdate: ${JSON.stringify(_event)}`)
    throw new Error("Update is not supported.");
}

function onDelete(_event: DeleteEvent) {
  console.log(`OnDelete: ${JSON.stringify(_event)}`)
  return {
    PhysicalResourceId: _event.PhysicalResourceId,
    Data: {
      Message: "Deletion is completed."
    }
  };
}

export const handler = async (event: CreateEvent | UpdateEvent | DeleteEvent) => {
  console.log(`Received event: ${JSON.stringify(event)}`);
  const requestType = event.RequestType;

  if ("ServiceToken" in event.ResourceProperties) {
    delete event.ResourceProperties.ServiceToken;
  }

  if (requestType === "Create") {
    return await onCreate(event);
  }
  if (requestType === "Update") {
    return onUpdate(event);
  }
  if (requestType === "Delete") {
    return onDelete(event);
  }
  throw new Error("Invalid request type: " + requestType);
};

    