import { Helmet } from "react-helmet-async";

interface PageHeadProps {
  title: string;
  description: string;
  url: string;
  image?: string;
  type?: string;
  publishedAt?: string;
  updatedAt?: string;
  authorName?: string;
}

const PageHead = ({
  title,
  description,
  url,
  image,
  type = "article",
  publishedAt,
  updatedAt,
  authorName,
}: PageHeadProps) => {
  const canonicalUrl =
    url && !url.includes("example.com")
      ? url
      : `${typeof window !== "undefined" ? window.location.origin : ""}${typeof window !== "undefined" ? window.location.pathname : ""}`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content={type} />
      {image && <meta property="og:image" content={image} />}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {publishedAt && <meta property="article:published_time" content={publishedAt} />}
      {updatedAt && <meta property="article:modified_time" content={updatedAt} />}
      {authorName && <meta property="article:author" content={authorName} />}
    </Helmet>
  );
};

export default PageHead;
