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
}: PageHeadProps) => (
  <Helmet>
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={url} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:url" content={url} />
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

export default PageHead;
