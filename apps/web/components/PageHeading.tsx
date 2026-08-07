import type { ReactNode } from "react";

type PageHeadingProps = {
  kicker: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeading({ kicker, title, description, actions }: PageHeadingProps) {
  return (
    <header className="page-heading">
      <div className="page-heading-row">
        <div className="page-heading-intro">
          <p className="page-heading-kicker">{kicker}</p>
          <h1 className="page-heading-title">{title}</h1>
        </div>
        {actions !== undefined && <div className="page-heading-actions">{actions}</div>}
      </div>
      <div className="page-heading-rule" aria-hidden="true" />
      {description !== undefined && <p className="page-heading-description">{description}</p>}
    </header>
  );
}
