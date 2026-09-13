import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-[76rem] px-5 sm:px-7 lg:px-10", className)} {...props} />
}
