import { CustomResourceBase } from "@constructs/customResourceBase";
import { Construct } from "constructs";
import * as path from "path";

export interface IamPasswordPolicyProps {
  /**
   * Allow IAM users to change their password
   *
   * @default true
   */
  allowUsersToChangePassword?: boolean;
  /**
   * Maximum password age in days
   *
   * @default 90
   */
  maxPasswordAge?: number;
  /**
   * Minimum password length
   *
   * @default 14
   */
  minimumPasswordLength?: number;
  /**
   * Number of passwords changes before re-use
   *
   * @default 24
   */
  passwordReusePrevention?: number;
  /**
   * Require lowercase characters in password
   *
   * @default true
   */
  requireLowercaseCharacters?: boolean;
  /**
   * Require numbers in password
   *
   * @default true
   */
  requireNumbers?: boolean;
  /**
   * Require symbols in password
   *
   * @default true
   */
  requireSymbols?: boolean;
  /**
   * Require uppercase characters in password
   *
   * @default true
   */
  requireUppercaseCharacters?: boolean;
}

export class IamPasswordPolicy extends CustomResourceBase {
  constructor(scope: Construct, id: string, props: IamPasswordPolicyProps) {
    super(scope, id, {
      functionName: "cdk-custom-resource-iam-password-policy",
      functionDescription: "CDK/CFN Custom Resource for IAM password policy management",
      functionFilePath: path.join(__dirname, "functionCode", "iamPasswordPolicyLambda.ts"),
      iamAllowActions: ["iam:UpdateAccountPasswordPolicy"],
      resourceProperties: {
        allowUsersToChangePassword: props.allowUsersToChangePassword || true,
        maxPasswordAge: props.maxPasswordAge || 90,
        minimumPasswordLength: props.minimumPasswordLength || 14,
        passwordReusePrevention: props.passwordReusePrevention || 24,
        requireLowercaseCharacters: props.requireLowercaseCharacters || true,
        requireNumbers: props.requireNumbers || true,
        requireSymbols: props.requireSymbols || true,
        requireUppercaseCharacters: props.requireUppercaseCharacters || true,
      },
    });
  }
}
