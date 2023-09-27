import {
  aws_iam as iam,
  aws_lambda_nodejs as nodejs,
  aws_lambda as lambda,
  aws_logs as logs,
  custom_resources as cr,
  CustomResource,
  Duration,
} from "aws-cdk-lib";
import { Construct } from "constructs";

interface CustomResourceBaseProps {
  /**
   * Lambda function name
   */
  functionName: string;
  /**
   * Optionally identify modules that are already available in the runtime
   *
   * Normally, this should be left blank.  Use this in cases where you must
   * bundle a newer version of the aws-sdk than the version the lambda runtime supplies.
   */
  externalModules?: string[];
  /**
   * Lambda function description
   */
  functionDescription: string;
  /**
   * Path to the handler code
   */
  functionFilePath: string;
  /**
   * Function Timeout
   *
   * @default Duration.minutes(1)
   */
  functionTimeout?: Duration;
  /**
   * List of IAM actions allowed to execute on **ALL** resources
   *
   * Cannot be specified with the role property
   */
  iamAllowActions?: string[];
  /**
   * Existing IAM role to use for the function
   *
   * Cannot be specificed with the iamAllowActions property
   */
  role?: iam.IRole;
  /**
   * Resource properties passed along to the function when executed
   *
   * @example { accountId: '123123123123' }
   */
  resourceProperties?: Record<string, any>;
}

export class CustomResourceBase extends Construct {
  public customResource: CustomResource;

  constructor(scope: Construct, id: string, props: CustomResourceBaseProps) {
    super(scope, id);

    // Only allow a role or iamAllowActions property
    if (props.role && props.iamAllowActions) {
      throw new Error("Only one of role or iamAllowActions can be specified on a custom resource.");
    }

    const lambdaFunction = new nodejs.NodejsFunction(this, props.functionName, {
      functionName: props.functionName,
      entry: props.functionFilePath,
      runtime: lambda.Runtime.NODEJS_18_X, // 18.x+ includes AWS JS SDKv3
      bundling: {
        sourceMap: true,
        externalModules: props.externalModules,
      },
      role: props.role,
      description: props.functionDescription,
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: props.functionTimeout ?? Duration.minutes(1),
    });

    // If a specific role was not provided, attach IAM permissions to the CDK generated function role
    if (props.iamAllowActions) {
      const policy = new iam.Policy(this, "policy", {
        policyName: "custom-resource-policy",
        statements: [
          new iam.PolicyStatement({
            actions: props.iamAllowActions,
            effect: iam.Effect.ALLOW,
            resources: ["*"],
          }),
        ],
      });
      lambdaFunction.role?.attachInlinePolicy(policy);
    }

    const provider = new cr.Provider(this, "provider", {
      onEventHandler: lambdaFunction,
      logRetention: logs.RetentionDays.ONE_DAY,
    });

    this.customResource = new CustomResource(this, "customResource", {
      serviceToken: provider.serviceToken,
      properties: props.resourceProperties,
    });
  }
}
