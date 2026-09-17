import { describe, it, expect } from "vitest";
import { parseNicheCsv } from "../nicheCsv";
describe("niche CSV import", () => {
  it("preserves quoted commas, escaped quotes, and embedded newlines", () =>
    expect(
      parseNicheCsv(
        '\uFEFFname,audience,pain_points\r\n"Care, at home","Families with ""questions""","Cost\nTime"\r\n',
      ),
    ).toEqual([
      {
        name: "Care, at home",
        slug: "care-at-home",
        audience: 'Families with "questions"',
        pain_points: "Cost\nTime",
      },
    ]));
  it.each([
    'name\n"Unclosed',
    "name,name\nA,B",
    "title\nA",
    "name,extra\nA,B",
    "name,audience\nA",
    "name\nA\nA",
    "name\n",
  ])("rejects malformed or ambiguous files %s", (csv) =>
    expect(() => parseNicheCsv(csv)).toThrow(),
  );
  it("catches collisions against existing records before writing", () =>
    expect(() => parseNicheCsv("name\nHome Care", ["home-care"])).toThrow(
      /duplicate/,
    ));
});
