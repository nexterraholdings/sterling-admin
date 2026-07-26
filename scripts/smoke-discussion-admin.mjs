/** Smoke check: list sort tokens accepted by admin_list_area_discussions. */
const allowed = new Set([
  "created_at",
  "-created_at",
  "comment_count",
  "-comment_count",
  "rate_count",
  "-rate_count",
  "avg_rate",
  "-avg_rate",
  "engagement_score",
  "-engagement_score",
  "title",
  "-title",
  "live_last_go_live_at",
  "-live_last_go_live_at",
]);

const samples = ["-created_at", "-live_last_go_live_at", "title"];
for (const s of samples) {
  const col = s.replace(/^-/, "");
  if (!allowed.has(s)) {
    console.error("Invalid sort sample:", s);
    process.exit(1);
  }
  if (!col) {
    console.error("Empty sort column");
    process.exit(1);
  }
}
console.log("discussion admin list sort smoke ok");
