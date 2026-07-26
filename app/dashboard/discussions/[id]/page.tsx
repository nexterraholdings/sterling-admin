import { use } from "react";
import { DiscussionDetailClient } from "./DiscussionDetailClient";

export default function DiscussionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <DiscussionDetailClient id={id} />;
}
