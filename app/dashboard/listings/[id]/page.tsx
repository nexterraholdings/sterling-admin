import { use } from "react";
import { ListingDetailClient } from "./ListingDetailClient";

export default function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ListingDetailClient id={id} />;
}
