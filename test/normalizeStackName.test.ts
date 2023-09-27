import { normalizeStackName } from "@helpers/stacks";

describe("Stack Names", () => {
  test("Normalized stack names", () => {
    expect(normalizeStackName("shared-services")).toStrictEqual("sharedServices");
    expect(normalizeStackName("Shared-Services")).toStrictEqual("sharedServices");
    expect(normalizeStackName("SHARED")).toStrictEqual("shared");
    expect(normalizeStackName("sharedServices")).toStrictEqual("sharedservices");
  });
  test("Normalized stack names with alternative separator", () => {
    expect(normalizeStackName("shared_services", "_")).toStrictEqual("sharedServices");
    expect(normalizeStackName("Shared_Services", "_")).toStrictEqual("sharedServices");
    expect(normalizeStackName("SHARED", "_")).toStrictEqual("shared");
    expect(normalizeStackName("sharedServices", "_")).toStrictEqual("sharedservices");
  });
});
