import type { SVGProps } from 'react'

function icon(path: string) {
  return function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        <path d={path} />
      </svg>
    )
  }
}

export const IconFolderOpenOutlineMedium = icon('M3 8V5h6l2 2h10v3M3 8h18l-3 11H3z')
export const IconPlusOutlineMedium = icon('M12 5v14M5 12h14')
export const IconUsersOutlineMedium = icon(
  'M3 20v-2a5 5 0 0 1 10 0v2M14 14a5 5 0 0 1 7 4v2M11 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M16 4a3 3 0 0 1 0 6',
)
export const IconShieldOutlineMedium = icon('M12 3 4 6v6c0 4 5 8 8 9 3-1 8-5 8-9V6zM8 12l3 3 5-6')
export const IconChevronRightOutlineMedium = icon('m9 5 7 7-7 7')
export const IconSearchOutlineMedium = icon('M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0')
export const IconFlatListOutlineMedium = icon('M8 5h13M8 12h13M8 19h13M3 5h.1M3 12h.1M3 19h.1')
export const IconAgentPresetOutlineMedium = icon('m12 2 10 6v8l-10 6-10-6V8zM12 2v20M2 8l10 6 10-6')
