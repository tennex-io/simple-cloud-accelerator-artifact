import { Budgets } from "@environments/organization/budgets";
import { App } from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import { getResourceName } from "./utils";
import { Account, AccountBudget } from "@lib/types";

const exampleBudget: AccountBudget = {
  dollarLimit: 100,
  percentageWarning: 80,
  accountEmailTargets: ["budgets@example.com"],
};

const exampleAccount: Account = {
  budget: exampleBudget,
  email: "example@example.com",
  iamAlias: "testAlias",
  id: "999999999999",
  name: "organization",
  primaryRegion: "us-east-1",
};

const app = new App();
const budgetStack = new Budgets(app, "budgets", {
  accounts: [exampleAccount],
});
const template = Template.fromStack(budgetStack);
const topicResourceName = getResourceName(template, "AWS::SNS::Topic");

describe("Budget Stack", () => {
  test("No error annotations are present", () => {
    Annotations.fromStack(budgetStack).hasNoError(
      "/budgets",
      Match.exact("Account organization does not have a budget specified.")
    );
  });

  test("Stack has expected number of resources", () => {
    template.resourceCountIs("AWS::SNS::TopicPolicy", 1);
    template.resourceCountIs("AWS::Budgets::Budget", 1);
    template.resourceCountIs("AWS::SNS::Topic", 1);
  });
});

describe("Topic Policy", () => {
  test("Allows bugdgets.amazonaws.com to publish", () => {
    template.hasResourceProperties(
      "AWS::SNS::TopicPolicy",
      Match.objectLike({
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: "sns:Publish",
              Effect: "Allow",
              Principal: {
                Service: "budgets.amazonaws.com",
              },
              Resource: {
                Ref: topicResourceName,
              },
            }),
          ]),
        },
      })
    );
  });

  test("Is associated with the SNS Topic", () => {
    template.hasResourceProperties(
      "AWS::SNS::TopicPolicy",
      Match.objectLike({
        Topics: [
          {
            Ref: topicResourceName,
          },
        ],
      })
    );
  });
});

describe("Account budget", () => {
  test("Dollar limit matches input", () => {
    template.hasResourceProperties(
      "AWS::Budgets::Budget",
      Match.objectLike({
        Budget: Match.objectLike({
          BudgetLimit: Match.objectEquals({
            Amount: exampleBudget.dollarLimit,
            Unit: "USD",
          }),
        }),
      })
    );
  });

  test("Linked to the expected account ID", () => {
    template.hasResourceProperties(
      "AWS::Budgets::Budget",
      Match.objectLike({
        Budget: Match.objectLike({
          CostFilters: {
            LinkedAccount: [exampleAccount.id],
          },
        }),
      })
    );
  });

  const budgetProperties = Object.values(template.findResources("AWS::Budgets::Budget"))[0].Properties;
  const budgetSubscribers = budgetProperties.NotificationsWithSubscribers[0].Subscribers;

  test("Expected target email addresses are subscribers", () => {
    const budgetEmailSubscribers = budgetSubscribers
      .filter((subscriber: any) => subscriber.SubscriptionType === "EMAIL")
      .map((subscriber: any) => subscriber.Address);
    const sortedExampleTargets = exampleBudget.accountEmailTargets;
    expect(sortedExampleTargets?.sort()).toEqual(budgetEmailSubscribers.sort());
  });

  test("SNS Topic is a subscriber", () => {
    const budgetSnsSubscription = budgetSubscribers
      .filter((subscriber: any) => subscriber.SubscriptionType === "SNS")
      .map((subscriber: any) => subscriber.Address);
    expect(budgetSnsSubscription[0]).toMatchObject({ Ref: topicResourceName });
  });
});
