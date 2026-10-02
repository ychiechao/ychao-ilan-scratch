import type { ReactNode } from "react";

type CourseMapBackButtonProps = { children: ReactNode };

export function CourseMapBackButton({ children }: CourseMapBackButtonProps) {
  return <form className="hard-navigation-form" action="/" method="get">
    <input type="hidden" name="mode" value="map" />
    <button type="submit">{children}</button>
  </form>;
}
