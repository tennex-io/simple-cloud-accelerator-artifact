import {
  AthenaClient,
  GetNamedQueryCommand,
  GetNamedQueryCommandOutput,
  StartQueryExecutionCommand,
  StartQueryExecutionCommandOutput,
} from "@aws-sdk/client-athena";
import { Context } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import * as esbuild from "esbuild";
import * as path from "path";

import { handler } from "../athenaCloudTrailCreateTables";
import { inputEventCreateBase, mockMetadata } from "./types";

const inputEvent = inputEventCreateBase;
inputEvent.ResourceProperties = {
  ...inputEvent.ResourceProperties,
  namedQueryIds: ["88888888-8888-8888-8888-888888888888", "99999999-9999-9999-9999-999999999999"],
  database: "cloudtrail",
  workGroup: "cloudtrail",
};

const mockGetNamedQueryResponse: GetNamedQueryCommandOutput = {
  ...mockMetadata,
  NamedQuery: {
    Name: "create-organziation-management-table",
    Database: "cloudtrail",
    QueryString: "CREATE EXTERNAL TABLE example",
  },
};

const mockStartQueryExecutionResponse: StartQueryExecutionCommandOutput = {
  ...mockMetadata,
  QueryExecutionId: "77777777-7777-7777-7777-777777777777",
};

const athenaMock = mockClient(AthenaClient);
athenaMock
  .on(GetNamedQueryCommand)
  .resolves(mockGetNamedQueryResponse)
  .on(StartQueryExecutionCommand)
  .resolves(mockStartQueryExecutionResponse);

describe("Athena CloudTrail Table Creation", () => {
  beforeEach(() => {
    athenaMock.reset();
  });

  it("Bundles without errors", async () => {
    const codepath = path.join(__dirname, "../athenaCloudTrailCreateTables.ts");

    await esbuild.build({
      entryPoints: [codepath],
      external: ["aws-sdk"],
      platform: "node",
      bundle: true,
      write: false,
    });
  });

  it("handler function is async", async () => {
    const task = handler(inputEvent, {} as Context);
    expect(task).toBeInstanceOf(Promise);
  });

  it("Execution returns the proper response", async () => {
    athenaMock
      .on(GetNamedQueryCommand)
      .resolves(mockGetNamedQueryResponse)
      .on(StartQueryExecutionCommand)
      .resolves(mockStartQueryExecutionResponse);
    const response = await handler(inputEvent, {} as Context);
    expect(response).toBe("success");
  });

  it("Logs an error if the handler throws an error", async () => {
    athenaMock.on(GetNamedQueryCommand).rejects(new Error("Test Error"));
    const consoleSpy = jest.spyOn(console, "error");
    await handler(inputEvent, {} as Context);
    expect(consoleSpy).toHaveBeenCalledWith("Test Error");
  });
});
