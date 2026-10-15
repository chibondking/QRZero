import { expect, test } from "@playwright/test";

const headers = { "x-qrzero-token": "e2e" };

test("a second log sees the same locations and equipment", async ({ request }) => {
  const mk = async (name: string) => (await (await request.post("/api/logs", { headers, data: { name } })).json()).id as number;
  const personal = await mk("Shared personal");
  const club = await mk("Shared club");

  const loc = await (await request.post(`/api/logs/${personal}/locations`, { headers, data: { name: "Shared shack", fields: { MY_GRIDSQUARE: "EN34" } } })).json();
  await request.post(`/api/locations/${loc.id}/equipment`, { headers, data: { kind: "rig", name: "Shared K3", fields: {} } });

  const locs = await (await request.get(`/api/logs/${club}/locations`, { headers })).json();
  expect(locs.map((l: { name: string }) => l.name)).toContain("Shared shack");
  const gear = await (await request.get(`/api/logs/${club}/equipment`, { headers })).json();
  expect(gear.map((e: { name: string }) => e.name)).toContain("Shared K3");

  // Deleting the log a location was made in keeps it for the other log.
  expect((await request.delete(`/api/logs/${personal}`, { headers })).ok()).toBeTruthy();
  const after = await (await request.get(`/api/logs/${club}/locations`, { headers })).json();
  expect(after.map((l: { name: string }) => l.name)).toContain("Shared shack");

});
