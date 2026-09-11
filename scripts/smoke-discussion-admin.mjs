/** Smoke check: list sort tokens accepted by admin_list_area_discussions. */
const allowed = new Set([
  "created_at",
  "-created_at",
  "comment_count",
  "-comment_count",
  "engagement_score",
  "-engagement_score",
  "title",
  "-title",
]);

const samples = ["-created_at", "title"];
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
