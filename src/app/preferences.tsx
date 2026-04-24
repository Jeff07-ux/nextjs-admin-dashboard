'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface Preferences {
  performanceBaseline: number
  themeColor: 'teal' | 'indigo' | 'orange'
  defaultView: 'dashboard' | 'settings'
}

interface PreferencesContextType {
  preferences: Preferences
  updatePreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
  clearData: () => void
}

const defaultPreferences: Preferences = {
  performanceBaseline: 100,
  themeColor: 'teal',
  defaultView: 'dashboard'
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('purity-settings')
    if (saved) {
      try {
        setPreferences({ ...defaultPreferences, ...JSON.parse(saved) })
      } catch (e) {
        console.error('Failed to parse settings', e)
      }
    }
    setIsLoaded(true)
  }, [])

  // Save to localStorage on change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('purity-settings', JSON.stringify(preferences))
    }
  }, [preferences, isLoaded])

  const updatePreference = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences(prev => ({ ...prev, [key]: value }))
  }

  const clearData = () => {
    localStorage.removeItem('purity-data')
    // Dispatch an event so the Dashboard can optionally listen and clear state
    window.dispatchEvent(new Event('purity-clear-data'))
  }

  return (
    <PreferencesContext.Provider value={{ preferences, updatePreference, clearData }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (context === undefined) {
    throw new Error('usePreferences must be used within a PreferencesProvider')
  }
  return context
}
