import {
  IAMClient,
  ListAccountAliasesCommand,
  ListAccountAliasesCommandOutput,
} from "@aws-sdk/client-iam";
import { Context } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import * as esbuild from "esbuild";
import * as path from "path";

import { handler } from "../iamAliasLambda";
import { inputEventCreateBase, mockMetadata } from "./types";

const mockListAccountAliasesExists: ListAccountAliasesCommandOutput = {
  ...mockMetadata,
  AccountAliases: ["test-account"],
};

const mockListAccountAliasesUnset: ListAccountAliasesCommandOutput = {
  ...mockMetadata,
  AccountAliases: [],
};

const inputEvent = inputEventCreateBase;
inputEvent.ResourceProperties.alias = "test";

const iamMock = mockClient(IAMClient);

describe("IAM Alias Lambda", () => {
  beforeEach(() => {
    iamMock.reset();
  });

  it("Bundles without errors", async () => {
    const codepath = path.join(__dirname, "../iamAliasLambda.ts");

    await esbuild.build({
      entryPoints: [codepath],
      external: ["aws-sdk"],
      platform: "node",
      bundle: true,
      write: false,
    });
  });

  it("handler function is async", async () => {
    iamMock.on(ListAccountAliasesCommand).resolves(mockListAccountAliasesUnset);
    const task = handler(inputEvent, {} as Context);
    expect(task).toBeInstanceOf(Promise);
    const response = await task;
    expect(response).toBe("success");
  });

  it("Executes successfully when alias is unset", async () => {
    iamMock.on(ListAccountAliasesCommand).resolves(mockListAccountAliasesUnset);
    const response = await handler(inputEvent, {} as Context);
    expect(response).toBe("success");
  });

  it("Executes successfully when alias already exists", async () => {
    iamMock.on(ListAccountAliasesCommand).resolves(mockListAccountAliasesExists);
    const response = await handler(inputEvent, {} as Context);
    expect(response).toBe("success");
  });

  it("Executes successfully when the desired alias and existing alias already match", async () => {
    inputEvent.ResourceProperties.alias = "test-account";
    iamMock.on(ListAccountAliasesCommand).resolves(mockListAccountAliasesExists);
    const response = await handler(inputEvent, {} as Context);
    expect(response).toBe("success");
  });

  it("Logs an error if the handler throws an error", async () => {
    const consoleSpy = jest.spyOn(console, "error");
    iamMock.on(ListAccountAliasesCommand).rejects(new Error("Test Error"));
    await handler(inputEvent, {} as Context);
    expect(consoleSpy).toHaveBeenCalledWith("Test Error");
  });
});
