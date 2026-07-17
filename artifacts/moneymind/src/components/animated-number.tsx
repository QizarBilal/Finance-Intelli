import * as React from "react"
import { motion, useSpring, useTransform } from "framer-motion"

export function AnimatedNumber({
  value,
  format = (val) => val.toString(),
  className
}: {
  value: number
  format?: (val: number) => string
  className?: string
}) {
  const spring = useSpring(value, { mass: 0.8, stiffness: 75, damping: 15 })
  const display = useTransform(spring, (current) => format(Math.round(current)))

  React.useEffect(() => {
    spring.set(value)
  }, [spring, value])

  return <motion.span className={className}>{display}</motion.span>
}