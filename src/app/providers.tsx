'use client'

import { ChakraProvider, extendTheme } from '@chakra-ui/react'

export const theme = extendTheme({
  config: {
    initialColorMode: 'light',
    useSystemColorMode: false,
  },
  fonts: {
    heading: "'Inter', sans-serif",
    body: "'Inter', sans-serif",
  },
  fontWeights: {
    normal: 500,
    medium: 600,
    bold: 700,
    extrabold: 800,
  },
  fontSizes: {
    xs:   '0.65rem',
    sm:   '0.75rem',
    md:   '0.825rem',
    lg:   '0.95rem',
    xl:   '1.05rem',
    '2xl': '1.2rem',
    '3xl': '1.4rem',
    '4xl': '1.65rem',
    '5xl': '1.9rem',
  },
  colors: {
    teal: {
      300: "#4FD1C5",
      400: "#38B2AC",
      500: "#285E61",
    },
    gray: {
      50: "#F8F9FA",
      100: "#E2E8F0",
      400: "#A0AEC0",
      500: "#718096",
      700: "#2D3748",
      800: "#1A202C",
      900: "#171923",
    }
  },
  styles: {
    global: (props: any) => ({
      body: {
        bg: props.colorMode === 'dark' ? 'gray.900' : 'gray.50',
        color: props.colorMode === 'dark' ? 'whiteAlpha.900' : 'gray.700',
        fontWeight: 'normal',
        letterSpacing: '-0.01em',
      }
    })
  },
  components: {
    Text: {
      baseStyle: {
        fontWeight: 'normal',
      }
    },
    Card: {
      baseStyle: {
        container: {
          bg: 'white',
          borderRadius: 'xl',
          boxShadow: '0px 3.5px 5.5px rgba(0, 0, 0, 0.02)',
          padding: '5'
        }
      }
    }
  }
})

import { PreferencesProvider } from './preferences'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PreferencesProvider>
      <ChakraProvider theme={theme}>{children}</ChakraProvider>
    </PreferencesProvider>
  )
}
