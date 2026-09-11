import { notFound } from "next/navigation";
import { getPost } from "../actions";
import { BlogEditorClient } from "./BlogEditorClient";

type Params = { params: Promise<{ id: string }> };

export default async function BlogEditorPage({ params }: Params) {
  const { id } = await params;

  if (id === "new") {
    return <BlogEditorClient post={null} />;
  }

  const post = await getPost(id);
  if (!post) notFound();

  return <BlogEditorClient post={post} />;
}
