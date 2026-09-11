/** Public blog hero art on sterlingtheapp.com. Used as the default cover for now. */
export const DEFAULT_BLOG_COVER = "https://sterlingtheapp.com/Assets/worldhubsbackground.png";

export function blogCoverUrl(_url?: string | null): string {
  return DEFAULT_BLOG_COVER;
}
