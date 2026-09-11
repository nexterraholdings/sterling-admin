import { listPosts } from "./actions";
import { BlogListView } from "./BlogListView";

export default async function BlogPage() {
  const { posts, error } = await listPosts();
  return <BlogListView initialPosts={posts} loadError={error} />;
}
