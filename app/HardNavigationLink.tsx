import type { ReactNode } from "react";

type HomeBackButtonProps = { children: ReactNode };

export function HomeBackButton({ children }: HomeBackButtonProps) {
  return <form className="hard-navigation-form" action="/" method="get">
    <button type="submit">{children}</button>
  </form>;
}
