import { Link } from "react-router-dom";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

const Breadcrumbs = ({ items }: { items: BreadcrumbItem[] }) => (
  <nav aria-label="Breadcrumb" className="mb-8">
    <ol className="flex items-center gap-2 flex-wrap font-body uppercase" style={{ fontSize: 10, letterSpacing: "0.15em", color: "rgba(255,255,255,0.3)", listStyle: "none", padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden="true">›</span>}
          {item.href && i < items.length - 1 ? (
            <a
              href={item.href}
              className="transition-colors duration-200 hover:text-[#D4AF55]"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              {item.label}
            </a>
          ) : (
            <span style={{ color: i === items.length - 1 ? "rgba(255,255,255,0.5)" : undefined }}>
              {item.label}
            </span>
          )}
        </li>
      ))}
    </ol>
  </nav>
);

export default Breadcrumbs;
