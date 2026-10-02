import type { ComponentProps } from "react";

type HardNavigationLinkProps = ComponentProps<"a"> & { href: string };

export function HardNavigationLink({ href, children, ...props }: HardNavigationLinkProps) {
  return <a href={href} {...props}>{children}</a>;
}
