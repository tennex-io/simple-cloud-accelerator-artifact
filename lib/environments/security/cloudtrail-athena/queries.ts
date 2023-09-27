import { validRegion, elbAccountByRegion } from "@lib/types";

/**
 * Athena CloudTrail table creation query with projected partitioning
 *
 * @param tableName Name of the table to create
 * @param s3uri Base S3 URI before the partitioned directories
 * @param regions AWS regions to be allowed to query on.  Defaults to all regions.
 * @returns full query with proper variable substitutions
 */
export function createTable(tableName: string, s3uri: string, regions?: validRegion[]) {
  return ` CREATE EXTERNAL TABLE ${tableName} (
  eventversion STRING,
  useridentity STRUCT<
                 type:STRING,
                 principalid:STRING,
                 arn:STRING,
                 account:STRING,
                 invokedby:STRING,
                 accesskeyid:STRING,
                 userName:STRING,
  sessioncontext:STRUCT<
  attributes:STRUCT<
                 mfaauthenticated:STRING,
                 creationdate:STRING>,
  sessionissuer:STRUCT<
                 type:STRING,
                 principalId:STRING,
                 arn:STRING,
                 account:STRING,
                 userName:STRING>>>,
  eventtime STRING,
  eventsource STRING,
  eventname STRING,
  awsregion STRING,
  sourceipaddress STRING,
  useragent STRING,
  errorcode STRING,
  errormessage STRING,
  requestparameters STRING,
  responseelements STRING,
  additionaleventdata STRING,
  requestid STRING,
  eventid STRING,
  resources ARRAY<STRUCT<
                 ARN:STRING,
                 account:STRING,
                 type:STRING>>,
  eventtype STRING,
  apiversion STRING,
  readonly STRING,
  recipientaccount STRING,
  serviceeventdetails STRING,
  sharedeventid STRING,
  vpcendpointid STRING
  )
  PARTITIONED BY (account string, region string, year string, month string, day string)
  ROW FORMAT SERDE
    'com.amazon.emr.hive.serde.CloudTrailSerde'
  STORED AS INPUTFORMAT
    'com.amazon.emr.cloudtrail.CloudTrailInputFormat'
  OUTPUTFORMAT
    'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
  LOCATION
    '${s3uri}'
  TBLPROPERTIES (
    'projection.enabled'='true',
    'projection.day.type'='integer',
    'projection.day.range'='01,31',
    'projection.day.digits'='2',
    'projection.month.type'='integer',
    'projection.month.range'='01,12',
    'projection.month.digits'='2',
    'projection.region.type'='enum',
    'projection.region.values'='${regions ?? Object.keys(elbAccountByRegion)}',
    'projection.year.type'='integer',
    'projection.year.range'='2010,2100',
    'projection.account.type'='injected',
    'storage.location.template'='${s3uri}\${account}/CloudTrail/\${region}/\${year}/\${month}/\${day}'
  )`;
}
