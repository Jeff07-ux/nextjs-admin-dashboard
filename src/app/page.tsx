'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Box, Flex, VStack, Text, Heading, useColorModeValue, useColorMode,
  Icon, SimpleGrid, Spinner, useToast, Select, Badge, Table,
  Thead, Tbody, Tr, Th, Td, TableContainer, IconButton,
  NumberInput, NumberInputField, NumberInputStepper, NumberIncrementStepper, NumberDecrementStepper,
  Button, FormControl, FormLabel, FormHelperText, Divider, HStack, Menu,
  MenuButton, MenuList, MenuItem
} from '@chakra-ui/react'
import {
  FiUploadCloud, FiBarChart2, FiActivity, FiAward,
  FiAlertTriangle, FiLayers, FiMoon, FiSun, FiTrendingUp,
  FiList, FiHome, FiSettings, FiDownload, FiImage, FiFileText
} from 'react-icons/fi'
import { useDropzone } from 'react-dropzone'
import html2canvas from 'html2canvas'
import axios from 'axios'
import { usePreferences } from './preferences'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend
} from 'recharts'

// ─── Capture chart as a canvas (hiding download controls) ────────────────────
async function captureChart(ref: React.RefObject<HTMLDivElement>): Promise<HTMLCanvasElement | null> {
  if (!ref.current) return null
  const controls = ref.current.querySelectorAll('[data-download-controls]') as NodeListOf<HTMLElement>
  controls.forEach(el => { el.style.display = 'none' })
  const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: null })
  controls.forEach(el => { el.style.display = '' })
  return canvas
}

// ─── Downloadable Card Wrapper ───────────────────────────────────────────────
function DownloadableCard({
  children, filename, tableData, tableColumns, ...rest
}: {
  children: React.ReactNode
  filename: string
  // Optional: underlying data rows and column keys for the Excel data sheet
  tableData?: Record<string, any>[]
  tableColumns?: string[]
  [key: string]: any
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)

  // ── PNG download ──────────────────────────────────────────────────────────
  const handlePngDownload = async () => {
    const canvas = await captureChart(cardRef)
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `${filename}.png`
    link.href = canvas.toDataURL('image/png', 1.0)
    link.click()
  }

  // ── Excel download: editable data table + native Excel bar chart ──────────
  const handleExcelDownload = async () => {
    if (!tableData || tableData.length === 0) return
    const cols = tableColumns ?? Object.keys(tableData[0])

    // 1. Build the Data sheet with ExcelJS
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Purity UI Dashboard'
    workbook.created = new Date()

    const dataSheet = workbook.addWorksheet('Data')
    const headerRow = dataSheet.addRow(cols)
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D3748' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF4FD1C5' } } }
    })
    tableData.forEach(row => {
      const values = cols.map(c => { const v = row[c]; return typeof v === 'number' ? +v.toFixed(2) : v ?? '' })
      dataSheet.addRow(values).eachCell(cell => { cell.alignment = { horizontal: 'center' } })
    })
    dataSheet.columns.forEach((col, i) => { col.width = Math.max(cols[i]?.length ?? 10, 14) + 4 })

    const excelBuffer = await workbook.xlsx.writeBuffer()

    // 2. Open the xlsx zip with JSZip
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(excelBuffer)

    // 3. Chart series config: col A = categories, col B+ = value series
    const colLetter = (i: number) => i < 26 ? String.fromCharCode(65 + i) : 'A'
    const CHART_COLORS = ['4FD1C5', 'ED64A6', 'F6AD55', '63B3ED', '68D391', 'FC8181', 'B794F4']
    const xCol = colLetter(0)
    const lastDataRow = tableData.length + 1
    const valueCols = cols.slice(1).map((label, i) => ({ col: colLetter(i + 1), label, color: CHART_COLORS[i % 7] }))

    // 4. Build chart1.xml – a native Excel clustered bar chart
    const seriesXml = valueCols.map((s, i) => `<c:ser>
      <c:idx val="${i}"/><c:order val="${i}"/>
      <c:tx><c:strRef><c:f>Data!$${s.col}$1</c:f>
        <c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${s.label}</c:v></c:pt></c:strCache>
      </c:strRef></c:tx>
      <c:cat><c:strRef><c:f>Data!$${xCol}$2:$${xCol}$${lastDataRow}</c:f></c:strRef></c:cat>
      <c:val><c:numRef><c:f>Data!$${s.col}$2:$${s.col}$${lastDataRow}</c:f></c:numRef></c:val>
      <c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>
    </c:ser>`).join('')

    const chartXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:lang val="en-US"/>
  <c:chart>
    <c:autoTitleDeleted val="1"/>
    <c:plotArea><c:layout/>
      <c:barChart>
        <c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>
        ${seriesXml}
        <c:axId val="1"/><c:axId val="2"/>
      </c:barChart>
      <c:catAx>
        <c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/><c:axPos val="b"/>
        <c:numFmt formatCode="General" sourceLinked="0"/>
        <c:tickLblPos val="nextTo"/><c:crossAx val="2"/>
        <c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/><c:axPos val="l"/>
        <c:numFmt formatCode="0.00" sourceLinked="0"/>
        <c:tickLblPos val="nextTo"/><c:crossAx val="1"/>
        <c:crosses val="autoZero"/><c:crossBetween val="between"/>
      </c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`

    // 5. Inject files into the xlsx zip
    zip.file('xl/charts/chart1.xml', chartXml)
    zip.file('xl/charts/_rels/chart1.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`)
    zip.file('xl/drawings/drawing1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:absoluteAnchor><xdr:pos x="0" y="0"/><xdr:ext cx="8000000" cy="5200000"/>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="8000000" cy="5200000"/></xdr:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId1"/>
      </a:graphicData></a:graphic>
    </xdr:graphicFrame><xdr:clientData/>
  </xdr:absoluteAnchor>
</xdr:wsDr>`)
    zip.file('xl/drawings/_rels/drawing1.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>
</Relationships>`)
    zip.file('xl/worksheets/sheet2.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetData/><drawing r:id="rId1"/>
</worksheet>`)
    zip.file('xl/worksheets/_rels/sheet2.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`)

    // 6. Patch workbook.xml, workbook.xml.rels, [Content_Types].xml
    const wbXml = await zip.file('xl/workbook.xml')!.async('string')
    zip.file('xl/workbook.xml', wbXml.replace('</sheets>', '<sheet name="Chart" sheetId="2" r:id="rId10"/></sheets>'))

    const wbRels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string')
    zip.file('xl/_rels/workbook.xml.rels', wbRels.replace('</Relationships>',
      '<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'))

    const ct = await zip.file('[Content_Types].xml')!.async('string')
    zip.file('[Content_Types].xml', ct.replace('</Types>',
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' +
      '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>' +
      '</Types>'))

    // 7. Generate and download
    const finalBuffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
    const blob = new Blob([finalBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = `${filename}.xlsx`; link.href = url; link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Box
      ref={cardRef}
      position="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...rest}
    >
      {/* ── Download dropdown ────────────────────────────────────────────── */}
      <Box
        data-download-controls
        position="absolute"
        top="3"
        right="3"
        zIndex="20"
        opacity={isHovered ? 1 : 0}
        visibility={isHovered ? 'visible' : 'hidden'}
        transition="opacity 0.2s"
      >
        <Menu placement="bottom-end">
          <MenuButton
            as={IconButton}
            aria-label="Download options"
            icon={<Icon as={FiDownload} />}
            size="sm"
            colorScheme="teal"
            variant="solid"
            boxShadow="md"
            borderRadius="full"
          />
          <MenuList minW="160px" fontSize="sm" zIndex={100}>
            <MenuItem icon={<Icon as={FiImage} />} onClick={handlePngDownload}>
              Download PNG
            </MenuItem>
            <MenuItem icon={<Icon as={FiFileText} />} onClick={handleExcelDownload}>
              Download Excel
            </MenuItem>
          </MenuList>
        </Menu>
      </Box>

      {children}
    </Box>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, badge, sub, icon, iconColor = 'teal.300' }: {
  label: string, value: string | number, badge?: string, sub?: string, icon: any, iconColor?: string
}) {
  const cardBg = useColorModeValue('white', '#1E2532')
  const valColor = useColorModeValue('gray.700', 'white')
  return (
    <Box bg={cardBg} borderRadius="2xl" px="4" py="3"
      boxShadow="0px 2px 12px rgba(0,0,0,0.06)" flex="1" minW="0">
      <Flex justify="space-between" align="center">
        <Box flex="1" mr="3">
          <Text fontSize="xs" color="gray.400" fontWeight={600}
            textTransform="none" mb="0.5" letterSpacing="tight">{label}</Text>
          <Flex align="baseline" gap="2" wrap="wrap">
            <Heading size="sm" color={valColor} fontWeight={800} lineHeight="1.2">{value}</Heading>
            {badge && <Text fontSize="xs" color="green.400" fontWeight="bold">{badge}</Text>}
          </Flex>
          {sub && <Text fontSize="10px" color="gray.400" mt="0.5" lineHeight="1">{sub}</Text>}
        </Box>
        <Box bg={iconColor} borderRadius="lg" p="2" color="white" flexShrink={0}>
          <Icon as={icon} boxSize="4" />
        </Box>
      </Flex>
    </Box>
  )
}

// ─── Performance Badge ────────────────────────────────────────────────────────
function PerfBadge({ value }: { value: number }) {
  const { preferences } = usePreferences()
  const base = preferences.performanceBaseline

  if (value >= 100) return <Badge colorScheme="green" borderRadius="full" px="3">{value.toFixed(1)}% ▲</Badge>
  if (value >= base) return <Badge colorScheme="yellow" borderRadius="full" px="3">{value.toFixed(1)}% →</Badge>
  return <Badge colorScheme="red" borderRadius="full" px="3">{value.toFixed(1)}% ▼</Badge>
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, sub, isDark }: { icon: any, title: string, sub?: any, isDark: boolean }) {
  const lightGrad = 'linear(to-r, #313860, #151928)'
  const darkGrad = 'linear(to-r, #81E6D9, #63B3ED)'
  return (
    <Flex align="center" gap="3" mb="1">
      <Box color="teal.300"><Icon as={icon} boxSize="4" /></Box>
      <Box>
        <Heading
          size="sm"
          bgGradient={isDark ? darkGrad : lightGrad}
          bgClip="text"
          fontWeight={800}
        >{title}</Heading>
        {sub && <Text fontSize="xs" color="gray.400" mt="0.5">{sub}</Text>}
      </Box>
    </Flex>
  )
}



// Pastel color palette for multi-line chart
const CABLE_COLORS = ['#4FD1C5', '#ED64A6', '#F6AD55', '#63B3ED', '#68D391', '#FC8181', '#B794F4']

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { preferences, updatePreference, clearData } = usePreferences()

  const [loading, setLoading] = useState(false)
  // We use preferences.defaultView to initialize, but since preferences loads in an effect, 
  // we might need a separate effect to set it once the first time preferences is loaded.
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings' | 'analytics' | 'reports'>(preferences.defaultView)
  const [hasInitializedTab, setHasInitializedTab] = useState(false)

  useEffect(() => {
    if (!hasInitializedTab && preferences.defaultView) {
      setActiveTab(preferences.defaultView)
      setHasInitializedTab(true)
    }
  }, [preferences.defaultView, hasInitializedTab])
  const [selectedCable, setSelectedCable] = useState<string>('all')
  const [data, setData] = useState<{
    phase_performance: any[]
    total_performance: any[]
    raw_preview: any[]
    summary_metrics: {
      total_cables: number
      avg_performance: number
      underperforming_phases: number
      top_cable: string
      top_cable_perf: number
    }
  } | null>(null)

  useEffect(() => {
    const handleClear = () => {
      setData(null)
      setSelectedCable('all')
    }
    window.addEventListener('purity-clear-data', handleClear)
    return () => window.removeEventListener('purity-clear-data', handleClear)
  }, [])

  const { colorMode, toggleColorMode } = useColorMode()
  const isDark = colorMode === 'dark'
  const toast = useToast()

  // ─── Theme Branding ────────────────────────────────────────────────────────
  const brandConfigs = {
    teal: { light: '#4FD1C5', dark: '#81E6D9', grad: 'linear(to-r, #81E6D9, #63B3ED)' },
    indigo: { light: '#5A67D8', dark: '#A3BFFA', grad: 'linear(to-r, #A3BFFA, #5A67D8)' },
    orange: { light: '#ED8936', dark: '#FBD38D', grad: 'linear(to-r, #FBD38D, #ED8936)' }
  }
  const curBrand = brandConfigs[preferences.themeColor] || brandConfigs.teal
  const brandColor = isDark ? curBrand.dark : curBrand.light

  // ─── Color tokens ──────────────────────────────────────────────────────────
  const pageBg = useColorModeValue('#F8F9FA', '#0F1117')
  const cardBg = useColorModeValue('white', '#1E2532')
  const sidebarBg = useColorModeValue('white', '#161B27')
  const textColor = useColorModeValue('gray.700', 'whiteAlpha.900')
  const subColor = useColorModeValue('gray.400', 'gray.500')
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100')
  const tableHeadBg = useColorModeValue('gray.50', '#161B27')
  const gridStroke = isDark ? 'rgba(255,255,255,0.07)' : '#E2E8F0'
  const tickFill = isDark ? '#718096' : '#A0AEC0'
  const tooltipStyle = {
    borderRadius: '10px', border: 'none',
    backgroundColor: isDark ? '#2D3748' : '#fff',
    color: isDark ? '#fff' : '#2D3748',
    boxShadow: '0px 2px 5.5px rgba(0,0,0,0.15)',
    fontSize: '0.8rem',
  }
  const lightGrad = 'linear(to-r, #313860, #151928)'
  const darkGrad = curBrand.grad
  const titleGrad = isDark ? darkGrad : lightGrad

  // ─── File upload ──────────────────────────────────────────────────────────
  const onDrop = async (acceptedFiles: File[], fileRejections: any[]) => {
    if (fileRejections.length > 0) {
      toast({
        title: 'File rejected',
        description: 'Please upload a valid Excel file (.xlsx, .xls) or a CSV file.',
        status: 'warning',
        duration: 5000,
        isClosable: true,
      })
      return
    }

    if (!acceptedFiles.length) return
    setLoading(true)
    const formData = new FormData()
    formData.append('file', acceptedFiles[0])

    // Detect backend URL
    const isProduction = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1')
    const backendUrl = isProduction ? `${window.location.origin}/.netlify/functions/upload` : `http://${window.location.hostname}:8000/api/upload`

    try {
      const res = await axios.post(backendUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setData(res.data)
      setSelectedCable('all')
      toast({ title: 'File uploaded successfully', status: 'success', duration: 3000, isClosable: true })
    } catch (err: any) {
      console.error('Upload error:', err)
      toast({
        title: 'Upload failed',
        description: err.response?.data?.detail || 'Could not connect to the backend server. Please ensure the backend is running on port 8000.',
        status: 'error', duration: 7000, isClosable: true,
      })
    } finally { setLoading(false) }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/msexcel': ['.xls'],
      'application/x-msexcel': ['.xls'],
      'application/x-ms-excel': ['.xls'],
      'application/x-excel': ['.xls'],
      'application/x-dos_ms_excel': ['.xls'],
      'application/xls': ['.xls'],
      'application/x-xls': ['.xls'],
      'text/csv': ['.csv'],
    },
    multiple: false,
  })

  // ─── Derived data ─────────────────────────────────────────────────────────
  const allCables = useMemo(
    () => data ? Array.from(new Set(data.phase_performance.map(d => d['Cable name']))) as string[] : [],
    [data]
  )
  const allPhases = useMemo(
    () => data ? Array.from(new Set(data.phase_performance.map(d => d['phase']))).sort() as string[] : [],
    [data]
  )

  const filteredPhase = useMemo(() => {
    if (!data) return []
    let result = data.phase_performance
    if (selectedCable !== 'all') result = result.filter(d => d['Cable name'] === selectedCable)
    return result.sort((a, b) => {
      const cableCompare = String(a['Cable name']).localeCompare(String(b['Cable name']))
      return cableCompare !== 0 ? cableCompare : String(a.phase).localeCompare(String(b.phase))
    })
  }, [data, selectedCable])

  const cableRowSpans = useMemo(() => {
    const spans: Record<string, number> = {}
    filteredPhase.forEach(row => {
      const cable = String(row['Cable name'])
      spans[cable] = (spans[cable] || 0) + 1
    })
    return spans
  }, [filteredPhase])

  const filteredTotal = useMemo(() => {
    if (!data) return []
    return selectedCable === 'all' 
      ? data.total_performance 
      : data.total_performance.filter(d => d['Cable name'] === selectedCable)
  }, [data, selectedCable])

  const displayCables = useMemo(
    () => selectedCable === 'all' ? allCables : [selectedCable],
    [allCables, selectedCable]
  )

  const handleCsvExport = () => {
    if (!data || !data.total_performance.length) return
    const items = data.total_performance
    const header = Object.keys(items[0])
    const csvContent = [
      header.join(','),
      ...items.map(row => 
        header.map(fieldName => {
          const val = row[fieldName]
          if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`
          return val ?? ''
        }).join(',')
      )
    ].join('\r\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `cable_performance_summary_${new Date().toISOString().split('T')[0]}.csv`)
    link.click()
    URL.revokeObjectURL(url)
    
    toast({
      title: 'CSV Export Successful',
      description: 'Your summarized performance report has been downloaded.',
      status: 'success',
      duration: 3000,
      isClosable: true,
    })
  }

  return (
    <Flex h="100vh" bg={pageBg}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <Box w="250px" bg={sidebarBg} boxShadow="sm" p="5" display="flex" flexDirection="column"
        borderRight="1px solid" borderColor={borderColor}>
        <VStack align="start" spacing="8" h="max-content">
          <Heading size="sm" color={textColor} pt="4" pl="2" fontWeight={800}>PURITY UI DASHBOARD</Heading>
          <VStack align="start" w="full" spacing="2">
            <Flex align="center" p="2.5" pl="3" w="full"
              bg={activeTab === 'dashboard' ? (isDark ? 'whiteAlpha.100' : 'white') : 'transparent'}
              borderRadius="xl" cursor="pointer"
              boxShadow={activeTab === 'dashboard' ? "0px 2px 5.5px rgba(0,0,0,0.04)" : "none"}
              _hover={{ bg: activeTab === 'dashboard' ? undefined : (isDark ? 'whiteAlpha.50' : 'gray.50') }}
              transition="all 0.2s" onClick={() => setActiveTab('dashboard')}>
              <Flex bg={activeTab === 'dashboard' ? brandColor : (isDark ? '#1E2532' : 'white')}
                w="30px" h="30px" align="center" justify="center" borderRadius="lg"
                color={activeTab === 'dashboard' ? "white" : brandColor} mr="3" boxShadow="lg">
                <Icon as={FiHome} boxSize="4" />
              </Flex>
              <Text fontWeight="bold" color={activeTab === 'dashboard' ? textColor : subColor} fontSize="sm">Dashboard</Text>
            </Flex>

            {/* Nav Item: Settings */}
            <Flex align="center" p="2.5" pl="3" w="full"
              bg={activeTab === 'settings' ? (isDark ? 'whiteAlpha.100' : 'white') : 'transparent'}
              borderRadius="xl" cursor="pointer"
              boxShadow={activeTab === 'settings' ? "0px 2px 5.5px rgba(0,0,0,0.04)" : "none"}
              _hover={{ bg: activeTab === 'settings' ? undefined : (isDark ? 'whiteAlpha.50' : 'gray.50') }}
              transition="all 0.2s" onClick={() => setActiveTab('settings')}>
              <Flex bg={activeTab === 'settings' ? brandColor : (isDark ? '#1E2532' : 'white')}
                w="30px" h="30px" align="center" justify="center" borderRadius="lg"
                color={activeTab === 'settings' ? "white" : brandColor} mr="3" boxShadow="md">
                <Icon as={FiSettings} boxSize="4" />
              </Flex>
              <Text fontWeight="bold" color={activeTab === 'settings' ? textColor : subColor} fontSize="sm">Settings</Text>
            </Flex>

            {/* Nav Item: Analytics */}
            <Flex align="center" p="2.5" pl="3" w="full"
              bg={activeTab === 'analytics' ? (isDark ? 'whiteAlpha.100' : 'white') : 'transparent'}
              borderRadius="xl" cursor="pointer"
              boxShadow={activeTab === 'analytics' ? "0px 2px 5.5px rgba(0,0,0,0.04)" : "none"}
              _hover={{ bg: activeTab === 'analytics' ? undefined : (isDark ? 'whiteAlpha.50' : 'gray.50') }}
              transition="all 0.2s" onClick={() => setActiveTab('analytics')}>
              <Flex bg={activeTab === 'analytics' ? brandColor : (isDark ? '#1E2532' : 'white')}
                w="30px" h="30px" align="center" justify="center" borderRadius="lg"
                color={activeTab === 'analytics' ? "white" : brandColor} mr="3" boxShadow="md">
                <Icon as={FiBarChart2} boxSize="4" />
              </Flex>
              <Text fontWeight="bold" color={activeTab === 'analytics' ? textColor : subColor} fontSize="sm">Analytics</Text>
            </Flex>

            {/* Nav Item: Reports */}
            <Flex align="center" p="2.5" pl="3" w="full"
              bg={activeTab === 'reports' ? (isDark ? 'whiteAlpha.100' : 'white') : 'transparent'}
              borderRadius="xl" cursor="pointer"
              boxShadow={activeTab === 'reports' ? "0px 2px 5.5px rgba(0,0,0,0.04)" : "none"}
              _hover={{ bg: activeTab === 'reports' ? undefined : (isDark ? 'whiteAlpha.50' : 'gray.50') }}
              transition="all 0.2s" onClick={() => setActiveTab('reports')}>
              <Flex bg={activeTab === 'reports' ? brandColor : (isDark ? '#1E2532' : 'white')}
                w="30px" h="30px" align="center" justify="center" borderRadius="lg"
                color={activeTab === 'reports' ? "white" : brandColor} mr="3" boxShadow="md">
                <Icon as={FiList} boxSize="4" />
              </Flex>
              <Text fontWeight="bold" color={activeTab === 'reports' ? textColor : subColor} fontSize="sm">Reports</Text>
            </Flex>
          </VStack>
        </VStack>
      </Box>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <Box flex="1" overflowY="auto" p="8">

        {/* Header */}
        <Flex justify="space-between" align="center" mb="8">
          <VStack align="start" spacing="1">
            <Text color={subColor} fontSize="xs" fontWeight="bold">Pages / {activeTab === 'dashboard' ? 'Dashboard' : 'Settings'}</Text>
            <Heading
              size="md"
              bgGradient={titleGrad}
              bgClip="text"
              fontWeight={800}
            >{activeTab === 'dashboard' ? 'Cable Performance' : 'Application Settings'}</Heading>
          </VStack>
          <IconButton
            aria-label="Toggle color mode"
            icon={<Icon as={isDark ? FiSun : FiMoon} boxSize="4" />}
            onClick={toggleColorMode}
            borderRadius="xl" bg={cardBg} color={textColor}
            boxShadow="0px 3.5px 5.5px rgba(0,0,0,0.07)"
            _hover={{ bg: isDark ? 'whiteAlpha.200' : 'gray.100' }} size="md"
          />
        </Flex>

        <Box display={activeTab === 'dashboard' ? 'block' : 'none'}>
          {/* Upload */}
          <Box {...getRootProps()} bg={cardBg} p="8" borderRadius="xl"
            boxShadow="0px 3.5px 5.5px rgba(0,0,0,0.05)"
            border="2px dashed" borderColor={isDragActive ? 'teal.300' : borderColor}
            textAlign="center" cursor="pointer" mb="8" transition="all 0.2s"
            _hover={{ borderColor: 'teal.300' }}>
            <input {...getInputProps()} />
            <VStack spacing="3">
              <Icon as={FiUploadCloud} boxSize="10" color={brandColor} />
              <Text fontWeight="bold" color={textColor}>
                {loading ? <Spinner color="teal.300" size="sm" /> :
                  isDragActive ? 'Drop the Excel file here...' :
                    'Drag & drop an Excel file here, or click to select'}
              </Text>
              <Text fontSize="xs" color={subColor}>Supports .xlsx and .xls</Text>
            </VStack>
          </Box>

          {data && (
            <VStack spacing="7" align="stretch">

              {/* ── Summary Cards ──────────────────────────────────────────── */}
              <Flex gap="4" wrap="wrap">
                <StatCard label="Total Cables" value={data.summary_metrics?.total_cables || 0}
                  icon={FiLayers} badge="+12%" iconColor={brandColor} />
                <StatCard label="Avg Performance" value={`${data.summary_metrics?.avg_performance || 0}%`}
                  icon={FiActivity} badge="+5%" iconColor={brandColor} />
                <StatCard label="Underperforming"
                  value={data.phase_performance.filter((d: any) => typeof d['Performance (%)'] === 'number' && d['Performance (%)'] < preferences.performanceBaseline).length}
                  sub={`Phases below ${preferences.performanceBaseline}%`} icon={FiAlertTriangle} iconColor="orange.400" />
                <StatCard label="Top Performer" value={data.summary_metrics?.top_cable || 'N/A'}
                  sub={`${data.summary_metrics?.top_cable_perf || 0}% total`} icon={FiAward} iconColor="blue.400" />
              </Flex>

              {/* ── Filters ─────────────────────────────────────────────────── */}
              <Flex align="center" gap="5" wrap="wrap">
                <Flex align="center" gap="3">
                  <Text fontWeight="bold" color={textColor} fontSize="sm" whiteSpace="nowrap">Filter by Cable:</Text>
                  <Select value={selectedCable} onChange={e => setSelectedCable(e.target.value)}
                    maxW="200px" borderRadius="xl" borderColor={borderColor} bg={cardBg} color={textColor} fontSize="sm"
                    _focus={{ borderColor: brandColor, boxShadow: `0 0 0 1px ${brandColor}` }}>
                    <option value="all">All Cables</option>
                    {allCables.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Flex>
              </Flex>

              {/* ═══════════════════════════════════════════════════════════════
                PANEL 2 – Cable Comparison Histogram
            ════════════════════════════════════════════════════════════════ */}

              {/* ── Dark Gradient Overview ──────────────────────────────────── */}
              <DownloadableCard
                filename={`cable_performance_overview`}
                tableData={filteredTotal}
                tableColumns={['Cable name', 'TS', 'TO', 'Total_Performance (%)']}
                bgImage="linear-gradient(81.62deg,#313860 2.25%,#151928 79.87%)"
                p="6" borderRadius="xl" boxShadow="0px 3.5px 5.5px rgba(0,0,0,0.1)">
                <Heading size="md" mb="1" color="white" fontWeight={800}>Cable Performance Overview</Heading>
                <Text fontSize="xs" color="whiteAlpha.600" mb="5">Total Performance % per Cable</Text>
                <Box h="240px">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredTotal} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="Cable name" axisLine={false} tickLine={false} tick={{ fill: '#fff', fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#fff', fontSize: 11 }} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.06)' }}
                        contentStyle={{ borderRadius: '10px', border: 'none', backgroundColor: '#2D3748', color: '#fff', fontSize: '0.8rem' }} />
                      <Bar dataKey="Total_Performance (%)" fill="#FFFFFF" radius={[4, 4, 0, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </DownloadableCard>

              {/* ── Phase Histograms ────────────────────────────────────────── */}
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing="5">
                {displayCables.map((cable, idx) => (
                  <DownloadableCard
                    filename={`phase_performance_${cable.replace(/\s+/g, '_')}`}
                    tableData={filteredPhase.filter(d => d['Cable name'] === cable)}
                    tableColumns={['Cable name', 'phase', 'TS', 'TO', 'Performance (%)']}
                    key={idx} bg={cardBg} p="5" borderRadius="xl" boxShadow="0px 3.5px 5.5px rgba(0,0,0,0.07)">
                    <SectionHeader icon={FiBarChart2} title="Phase Performance" isDark={isDark}
                      sub={<><Text as="span" color="teal.300" fontWeight="bold">{cable}</Text></>} />
                    <Box h="240px" mt="4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={filteredPhase.filter(d => d['Cable name'] === cable)}
                          margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                          <defs>
                            <linearGradient id={`bg${idx}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={brandColor} stopOpacity={1} />
                              <stop offset="100%" stopColor="#3182CE" stopOpacity={0.8} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                          <XAxis dataKey="phase" axisLine={false} tickLine={false} tick={{ fill: tickFill, fontSize: 11 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: tickFill, fontSize: 11 }} />
                          <Tooltip cursor={{ fill: 'rgba(79,209,197,0.08)' }} contentStyle={tooltipStyle} />
                            <Bar dataKey="Performance (%)" fill={`url(#bg${idx})`} radius={[5, 5, 0, 0]} barSize={30} label={{ position: 'top', fontSize: 10, fill: isDark ? '#fff' : '#2D3748', formatter: (value) => Math.round(value) }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  </DownloadableCard>
                ))}
              </SimpleGrid>

              {/* ── Data Table ──────────────────────────────────────────────── */}
              <Box bg={cardBg} borderRadius="xl" boxShadow="0px 3.5px 5.5px rgba(0,0,0,0.07)" overflow="hidden">
                <Box p="5" pb="2">
                  <SectionHeader icon={FiList} title="Phase Performance Table" isDark={isDark}
                    sub={selectedCable === 'all' ? 'All cables' : `Filtered: ${selectedCable}`} />
                </Box>
                <Box px="5" pb="4" display="flex" flexWrap="wrap" gap="3" alignItems="center" justifyContent="space-between">
                  <Text fontWeight="bold" color={textColor} fontSize="sm">Filter this table by cable</Text>
                  <Select value={selectedCable} onChange={e => setSelectedCable(e.target.value)} maxW="240px"
                    borderRadius="xl" borderColor={borderColor} bg={cardBg} color={textColor} fontSize="sm"
                    _focus={{ borderColor: brandColor, boxShadow: `0 0 0 1px ${brandColor}` }}>
                    <option value="all">All Cables</option>
                    {allCables.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Box>
                <TableContainer>
                  <Table variant="simple" size="sm">
                    <Thead bg={tableHeadBg}>
                      <Tr>
                        {['Cable', 'Phase', 'TS (Avg)', 'TO', 'Performance'].map(h => (
                          <Th key={h} color={subColor} fontSize="xs" borderColor={borderColor}
                            isNumeric={['TS (Avg)', 'TO', 'Performance'].includes(h)}>{h}</Th>
                        ))}
                      </Tr>
                    </Thead>
                    <Tbody>
                      {filteredPhase.map((row, idx) => {
                        const prevCable = idx > 0 ? filteredPhase[idx - 1]['Cable name'] : null
                        const isNewCable = row['Cable name'] !== prevCable
                        return (
                          <Tr
                            key={idx}
                            _hover={{ bg: isDark ? 'whiteAlpha.50' : 'gray.50' }}
                            transition="background 0.15s"
                            borderTop={isNewCable ? '2px solid' : '1px solid'}
                            borderColor={isNewCable ? brandColor : borderColor}
                          >
                            {isNewCable && (
                              <Td rowSpan={cableRowSpans[row['Cable name']]} fontWeight="bold" color={textColor}
                                fontSize="xs" borderColor={borderColor} verticalAlign="middle">
                                {row['Cable name']}
                              </Td>
                            )}
                            <Td color={subColor} fontSize="xs" borderColor={borderColor}>{row['phase']}</Td>
                            <Td isNumeric color={subColor} fontSize="xs" borderColor={borderColor}>
                              {typeof row['TS'] === 'number' ? row['TS'].toFixed(2) : row['TS']}
                            </Td>
                            <Td isNumeric color={subColor} fontSize="xs" borderColor={borderColor}>{row['TO']}</Td>
                            <Td isNumeric borderColor={borderColor}>
                              {typeof row['Performance (%)'] === 'number'
                                ? <PerfBadge value={row['Performance (%)']} />
                                : <Badge colorScheme="gray">N/A</Badge>}
                            </Td>
                          </Tr>
                        )
                      })}
                    </Tbody>
                  </Table>
                </TableContainer>
              </Box>





            </VStack>
          )}
        </Box>

        <Box display={activeTab === 'analytics' ? 'block' : 'none'}>
          <Box bg={cardBg} p="8" borderRadius="xl" boxShadow="0px 3.5px 5.5px rgba(0,0,0,0.07)">
            <SectionHeader icon={FiTrendingUp} title="Advanced Analytics" isDark={isDark} sub="Deeper insights and statistical distributions." />
            {!data ? (
              <Box py="20" textAlign="center">
                <Text color={subColor}>Upload an Excel file in the Dashboard to see advanced charts here.</Text>
              </Box>
            ) : (
              <VStack spacing="8" mt="6" align="stretch">
                <DownloadableCard
                  filename="performance_distribution"
                  tableData={filteredTotal}
                  tableColumns={['Cable name', 'TS', 'TO', 'Total_Performance (%)']}
                  bg={isDark ? 'whiteAlpha.50' : 'gray.50'} p="6" borderRadius="xl" border="1px dashed" borderColor={borderColor}>
                  <Text fontWeight="bold" mb="4">Performance Distribution (Anomaly Snapshot)</Text>
                  <Text fontSize="sm" color={subColor} mb="6">This view helps you identify whether your performance is normally distributed or heavily skewed towards specific ranges.</Text>
                  {/* We can re-use the chart logic we had or simplify it */}
                  <Box h="300px">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={filteredTotal} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                        <XAxis dataKey="Cable name" axisLine={false} tickLine={false} tick={{ fill: tickFill, fontSize: 11 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: tickFill, fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="Total_Performance (%)" fill={brandColor} radius={[6, 6, 0, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </DownloadableCard>
              </VStack>
            )}
          </Box>
        </Box>

        <Box display={activeTab === 'reports' ? 'block' : 'none'}>
          <Box bg={cardBg} p="8" borderRadius="xl" boxShadow="0px 3.5px 5.5px rgba(0,0,0,0.07)">
            <SectionHeader icon={FiList} title="Data Reports & Export" isDark={isDark} sub="Export your processed data or generate summary sheets." />
            {!data ? (
              <Box py="20" textAlign="center">
                <Text color={subColor}>Upload an Excel file to generate reports.</Text>
              </Box>
            ) : (
              <VStack spacing="6" mt="8" align="stretch">
                <Flex align="center" justify="space-between" p="5" bg={isDark ? 'whiteAlpha.50' : 'gray.50'} borderRadius="xl" border="1px solid" borderColor={borderColor}>
                  <HStack spacing="4">
                    <Icon as={FiUploadCloud} boxSize="6" color={brandColor} />
                    <Box>
                      <Text fontWeight="bold">Export Summary (.CSV)</Text>
                      <Text fontSize="xs" color={subColor}>Download a consolidated view of all cable performances.</Text>
                    </Box>
                  </HStack>
                  <Button size="sm" colorScheme={preferences.themeColor} onClick={handleCsvExport}>Download CSV</Button>
                </Flex>

                <Flex align="center" justify="space-between" p="5" bg={isDark ? 'whiteAlpha.50' : 'gray.50'} borderRadius="xl" border="1px solid" borderColor={borderColor}>
                  <HStack spacing="4">
                    <Icon as={FiBarChart2} boxSize="6" color={brandColor} />
                    <Box>
                      <Text fontWeight="bold">Generate PDF Report</Text>
                      <Text fontSize="xs" color={subColor}>Create a high-quality visualization report for the current data.</Text>
                    </Box>
                  </HStack>
                  <Button size="sm" variant="outline" colorScheme={preferences.themeColor}>Generate PDF</Button>
                </Flex>
              </VStack>
            )}
          </Box>
        </Box>

        <Box display={activeTab === 'settings' ? 'block' : 'none'}>
          <Box bg={cardBg} p="8" borderRadius="xl" boxShadow="0px 3.5px 5.5px rgba(0,0,0,0.07)">
            <SectionHeader icon={FiSettings} title="General Preferences" isDark={isDark} sub="Manage application settings and thresholds here." />

            <VStack mt="8" spacing="8" align="stretch" maxW="600px">

              {/* Theme Settings */}
              <FormControl>
                <FormLabel fontWeight="bold" color={textColor}>Application Accent Color</FormLabel>
                <FormHelperText mb="3" color={subColor}>Choose a primary color for the dashboard gradients, active icons, and chart accents.</FormHelperText>
                <HStack spacing="4">
                  {Object.entries(brandConfigs).map(([key, cfg]) => (
                    <Box
                      key={key}
                      w="40px" h="40px"
                      borderRadius="full"
                      bg={cfg.light}
                      cursor="pointer"
                      border="3px solid"
                      borderColor={preferences.themeColor === key ? (isDark ? 'white' : 'gray.800') : 'transparent'}
                      transition="all 0.2s"
                      _hover={{ transform: 'scale(1.1)' }}
                      onClick={() => updatePreference('themeColor', key as any)}
                    />
                  ))}
                </HStack>
              </FormControl>

              <Divider borderColor={borderColor} />

              {/* Navigation Settings */}
              <FormControl display="flex" alignItems="center" justifyContent="space-between">
                <Box pr="4">
                  <FormLabel fontWeight="bold" color={textColor} mb="0">Default Start View</FormLabel>
                  <FormHelperText mt="1" color={subColor}>Choose whether the Dashboard or Settings page opens by default when you load the application.</FormHelperText>
                </Box>
                <Select
                  value={preferences.defaultView}
                  onChange={(e) => updatePreference('defaultView', e.target.value as any)}
                  maxW="140px" borderRadius="lg" bg={isDark ? 'whiteAlpha.50' : 'gray.50'} borderColor={borderColor}>
                  <option value="dashboard" style={{ background: isDark ? '#1E2532' : 'white' }}>Dashboard</option>
                  <option value="settings" style={{ background: isDark ? '#1E2532' : 'white' }}>Settings</option>
                </Select>
              </FormControl>

              <Divider borderColor={borderColor} />

              {/* Analytics Settings */}
              <FormControl>
                <FormLabel fontWeight="bold" color={textColor}>Performance Baseline (%)</FormLabel>
                <FormHelperText mb="3" color={subColor}>Set the percentage threshold below which a phase is considered &quot;underperforming&quot; (triggers Yellow/Red badges). Overrides the default 80%.</FormHelperText>
                <NumberInput
                  value={preferences.performanceBaseline}
                  onChange={(_, val) => updatePreference('performanceBaseline', isNaN(val) ? 80 : val)}
                  min={0} max={150} step={5} maxW="120px">
                  <NumberInputField bg={isDark ? 'whiteAlpha.50' : 'gray.50'} borderColor={borderColor} />
                  <NumberInputStepper>
                    <NumberIncrementStepper color={subColor} borderColor={borderColor} />
                    <NumberDecrementStepper color={subColor} borderColor={borderColor} />
                  </NumberInputStepper>
                </NumberInput>
              </FormControl>

              <Divider borderColor={borderColor} />

              <FormControl>
                <FormLabel fontWeight="bold" color={textColor}>Data Management</FormLabel>
                <FormHelperText mb="3" color={subColor}>Clear all currently loaded metrics and uploaded Excel data from the dashboard.</FormHelperText>
                <Button colorScheme="red" variant="outline" size="sm" onClick={clearData}>
                  Clear All Data
                </Button>
              </FormControl>

            </VStack>
          </Box>
        </Box>

      </Box>
    </Flex>
  )
}
