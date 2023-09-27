import {
  Stack,
  StackProps,
  aws_budgets as budgets,
  aws_chatbot as chatbot,
  aws_iam as iam,
  aws_sns as sns,
  Annotations,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { Account } from "@lib/types";

interface ChatBotConfig {
  /**
   * Slack Channel ID
   *
   * @example C09999999RV
   */
  slackChannelId: string;
  /**
   * Slack Workspace ID
   *
   * @example T09999999QB
   */
  slackWorkspaceId: string;
}

interface BudgetProps extends StackProps {
  /**
   * List of email addresses to deliver budget alerts to
   */
  alertEmailTargets?: string[];
  /**
   * List of account objects to create budgets for
   */
  accounts: ReadonlyArray<Account>;
  /**
   * Slack Chatbot Configuration
   */
  chatBotConfig?: ChatBotConfig;
}

interface CustomBudgetDetails {
  /**
   * Leading name of the budget.  Will be suffixed with '-daily'
   */
  budgetName: string;
  /**
   * Existing SNS topic ARN
   *
   * @default no action
   */
  topicArn?: string;
  /**
   * AWS Account ID for the budget
   */
  accountId: string;
  /**
   * Dollar limit for the budget
   *
   * @example 500
   */
  dollarLimit: number;
  /**
   * Percentage at which the warning email will be triggered
   *
   * @example 80
   */
  percentageWarning: number;
}

export class Budgets extends Stack {
  public topic: sns.Topic;

  constructor(scope: Construct, id: string, props: BudgetProps) {
    super(scope, id, props);

    this.createSnsTopic();

    if (props.chatBotConfig) {
      this.createChatBot(props.chatBotConfig);
    }

    props.accounts.forEach((account) => {
      if (!account.budget) {
        Annotations.of(this).addError(`Account ${account.name} does not have a budget specified.`);
      } else {
        this.createDailyBudget(
          {
            budgetName: `${account.name}-daily`,
            accountId: account.id,
            topicArn: this.topic.topicArn,
            dollarLimit: account.budget.dollarLimit,
            percentageWarning: account.budget.percentageWarning ?? 80,
          },
          account.budget.accountEmailTargets ?? []
        );
      }
    });
  }

  createSnsTopic() {
    this.topic = new sns.Topic(this, "snsBudget", {
      topicName: "chatbot-budget-alerts",
      displayName: "chatbot-budget-alerts",
    });

    this.topic.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["sns:Publish"],
        effect: iam.Effect.ALLOW,
        resources: [this.topic.topicArn],
        principals: [new iam.ServicePrincipal("budgets.amazonaws.com")],
      })
    );
  }

  createChatBot(botProps: ChatBotConfig) {
    const chatBotRole = new iam.Role(this, "roleChatBot", {
      assumedBy: new iam.ServicePrincipal("chatbot.amazonaws.com"),
      description: "budget alert chatbot role",
      roleName: "chatbot-budgets",
    });

    chatBotRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:Describe*", "cloudwatch:Get*", "cloudwatch:List*"],
        effect: iam.Effect.ALLOW,
        resources: ["*"],
      })
    );

    const chatBot = new chatbot.SlackChannelConfiguration(this, "slackBudgetBot", {
      slackChannelConfigurationName: "budget-alerts",
      slackChannelId: botProps.slackChannelId,
      slackWorkspaceId: botProps.slackWorkspaceId,
      notificationTopics: [this.topic],
      role: chatBotRole,
    });

    const cfnChatBot = chatBot.node.defaultChild as chatbot.CfnSlackChannelConfiguration;
    cfnChatBot.guardrailPolicies = ["arn:aws:iam::aws:policy/AWSBudgetsReadOnlyAccess"];
  }

  createDailyBudget(budgetProps: CustomBudgetDetails, alertEmailTargets: string[]): void {
    const subscribers = alertEmailTargets.map((email) => ({ address: email, subscriptionType: "EMAIL" }));

    if (budgetProps.topicArn) {
      subscribers.push({
        address: budgetProps.topicArn,
        subscriptionType: "SNS",
      });
    }

    const budget = new budgets.CfnBudget(this, budgetProps.budgetName, {
      budget: {
        budgetType: "COST",
        budgetLimit: {
          amount: budgetProps.dollarLimit,
          unit: "USD",
        },
        timeUnit: "DAILY",
        costFilters: {
          LinkedAccount: [budgetProps.accountId],
        },
        costTypes: {
          includeTax: true,
          includeSubscription: true,
          useBlended: false,
          // Note the next two are intentionally false
          includeRefund: false,
          includeCredit: false,
          includeUpfront: true,
          includeRecurring: true,
          includeOtherSubscription: true,
          includeSupport: true,
          includeDiscount: true,
          useAmortized: false,
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            comparisonOperator: "GREATER_THAN",
            threshold: budgetProps.percentageWarning,
            notificationType: "ACTUAL",
            thresholdType: "PERCENTAGE",
          },
          subscribers,
        },
      ],
    });

    // Setting an explicit budget name isn't possible.  Once any budget property is updated,
    // the budget must be re-created.  This results in a failure because the budget
    // names for the previous and new resources are identical.  Instead, we'll let the cfn
    // API infer a prefix from the resource name and update accordingly
    budget.overrideLogicalId(this.normalizeResourceName(budgetProps.budgetName));
  }

  /**
   * Remove - and _ from the account name and convert each word to proper case
   * to conform to CloudFormation resource naming requirements
   *
   * @link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resources-section-structure.html#resources-section-structure-syntax
   * @param name account name
   * @returns CamelCase account name
   */
  private normalizeResourceName(name: string) {
    const scrub = name.replace(/-|_/g, " ");
    const wordsToProperCase = scrub
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("");
    return wordsToProperCase;
  }
}
