import React, { useState, useCallback } from 'react'
import {
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Select,
  Stack,
  Text,
  TextArea,
  TextInput,
  Checkbox,
  Badge,
  Spinner,
  Toast
} from '@sanity/ui'
import { TransferIcon, SearchIcon, EditIcon } from '@sanity/icons'
import { SanityClient } from 'sanity'

export interface ConvertIdsToSlugsProps {
  client: SanityClient
  documentTypes?: string[]
  onComplete?: (results: ConversionResult) => void
  onError?: (error: string) => void
  batchSize?: number
  dryRun?: boolean
  maxDocuments?: number
}

export interface ConversionResult {
  converted: number
  errors: string[]
  slugsGenerated: string[]
}

interface DocumentWithSlug {
  _id: string
  _type: string
  title?: string
  name?: string
  slug?: { current?: string }
  [key: string]: any
}

const ConvertIdsToSlugs: React.FC<ConvertIdsToSlugsProps> = ({
  client,
  documentTypes = [],
  onComplete,
  onError,
  batchSize = 10,
  dryRun = false,
  maxDocuments = 1000
}) => {
  const [selectedType, setSelectedType] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [useCustomQuery, setUseCustomQuery] = useState(false)
  const [customGroqQuery, setCustomGroqQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [documents, setDocuments] = useState<DocumentWithSlug[]>([])
  const [documentsToConvert, setDocumentsToConvert] = useState<DocumentWithSlug[]>([])
  const [message, setMessage] = useState('')
  const [slugField, setSlugField] = useState('slug')
  const [sourceField, setSourceField] = useState('title')
  const [slugPrefix, setSlugPrefix] = useState('')
  const [slugSuffix, setSlugSuffix] = useState('')
  const [replaceExisting, setReplaceExisting] = useState(false)

  const generateSlug = (text: string): string => {
    if (!text) return ''
    
    // Basic slug generation
    let slug = text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
      .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    
    // Add prefix and suffix if specified
    if (slugPrefix) slug = `${slugPrefix}-${slug}`
    if (slugSuffix) slug = `${slug}-${slugSuffix}`
    
    return slug
  }

  const scanForDocuments = useCallback(async () => {
    if (!client) return
    
    setIsScanning(true)
    setMessage('Scanning for documents...')
    
    try {
      let query = ''
      
      if (useCustomQuery && customGroqQuery) {
        query = customGroqQuery
      } else {
        const typeFilter = selectedType ? `_type == "${selectedType}"` : 'defined(_type)'
        const searchFilter = searchQuery ? ` && (title match "*${searchQuery}*" || name match "*${searchQuery}*")` : ''
        query = `*[${typeFilter}${searchFilter}][0...${maxDocuments}] {
          _id,
          _type,
          title,
          name,
          ${slugField}
        }`
      }
      
      const docs = await client.fetch(query)
      setDocuments(docs)
      
      // Filter documents that need slug conversion
      const needsConversion = docs.filter((doc: DocumentWithSlug) => {
        const hasSlug = doc[slugField]?.current
        const hasSource = doc[sourceField] || doc.title || doc.name
        
        if (replaceExisting) {
          return hasSource // Convert all documents with source field
        } else {
          return hasSource && !hasSlug // Only convert documents without existing slugs
        }
      })
      
      setDocumentsToConvert(needsConversion)
      setMessage(`Found ${needsConversion.length} documents that need slug conversion`)
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Scan failed'
      setMessage(`Scan error: ${errorMessage}`)
      onError?.(errorMessage)
    } finally {
      setIsScanning(false)
    }
  }, [client, selectedType, searchQuery, useCustomQuery, customGroqQuery, maxDocuments, slugField, sourceField, replaceExisting, onError])

  const convertToSlugs = useCallback(async () => {
    if (!client || documentsToConvert.length === 0) return
    
    setIsLoading(true)
    setMessage('Converting IDs to slugs...')
    
    try {
      let converted = 0
      const errors: string[] = []
      const slugsGenerated: string[] = []
      
      for (let i = 0; i < documentsToConvert.length; i += batchSize) {
        const batch = documentsToConvert.slice(i, i + batchSize)
        
        for (const doc of batch) {
          try {
            // Get source text for slug generation
            const sourceText = doc[sourceField] || doc.title || doc.name || doc._id
            const newSlug = generateSlug(sourceText)
            
            if (!newSlug) {
              errors.push(`Failed to generate slug for ${doc._id}: no source text found`)
              continue
            }
            
            // Check if slug already exists (to avoid duplicates)
            const existingDoc = await client.fetch(
              `*[_type == "${doc._type}" && ${slugField}.current == $slug && _id != $id][0]`,
              { slug: newSlug, id: doc._id }
            )
            
            let finalSlug = newSlug
            if (existingDoc) {
              // Add timestamp to make it unique
              finalSlug = `${newSlug}-${Date.now()}`
            }
            
            if (!dryRun) {
              await client
                .patch(doc._id)
                .set({
                  [slugField]: {
                    _type: 'slug',
                    current: finalSlug
                  }
                })
                .commit()
            }
            
            converted++
            slugsGenerated.push(finalSlug)
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Conversion failed'
            errors.push(`Failed to convert ${doc._id}: ${errorMessage}`)
          }
        }
        
        setMessage(`${dryRun ? 'Would convert' : 'Converted'} ${converted}/${documentsToConvert.length} documents...`)
      }
      
      const result: ConversionResult = {
        converted,
        errors,
        slugsGenerated
      }
      
      setMessage(`${dryRun ? 'Dry run complete' : 'Conversion complete'}: ${converted} documents processed`)
      onComplete?.(result)
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Conversion failed'
      setMessage(`Conversion error: ${errorMessage}`)
      onError?.(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [client, documentsToConvert, batchSize, dryRun, sourceField, slugField, slugPrefix, slugSuffix, generateSlug, onComplete, onError])

  return (
    <Card padding={4}>
      <Stack space={4}>
        <Heading size={2}>Convert IDs to Slugs</Heading>
        
        <Text size={1} muted>
          Convert document IDs to human-readable slugs with customizable generation rules.
        </Text>

        {/* Document Type Selection */}
        <Stack space={2}>
          <Text weight="semibold">Document Type</Text>
          <Select
            value={selectedType}
            onChange={(event) => setSelectedType(event.currentTarget.value)}
          >
            <option value="">All document types</option>
            {documentTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </Select>
        </Stack>

        {/* Slug Configuration */}
        <Card padding={3} tone="primary">
          <Stack space={3}>
            <Text weight="semibold">Slug Configuration</Text>
            
            <Flex gap={3}>
              <Box flex={1}>
                <Stack space={2}>
                  <Text size={1} weight="medium">Source Field</Text>
                  <TextInput
                    placeholder="Field to generate slug from (e.g., title, name)"
                    value={sourceField}
                    onChange={(event) => setSourceField(event.currentTarget.value)}
                  />
                </Stack>
              </Box>
              
              <Box flex={1}>
                <Stack space={2}>
                  <Text size={1} weight="medium">Slug Field</Text>
                  <TextInput
                    placeholder="Field to store slug (e.g., slug)"
                    value={slugField}
                    onChange={(event) => setSlugField(event.currentTarget.value)}
                  />
                </Stack>
              </Box>
            </Flex>
            
            <Flex gap={3}>
              <Box flex={1}>
                <Stack space={2}>
                  <Text size={1} weight="medium">Slug Prefix (Optional)</Text>
                  <TextInput
                    placeholder="Prefix to add to all slugs"
                    value={slugPrefix}
                    onChange={(event) => setSlugPrefix(event.currentTarget.value)}
                  />
                </Stack>
              </Box>
              
              <Box flex={1}>
                <Stack space={2}>
                  <Text size={1} weight="medium">Slug Suffix (Optional)</Text>
                  <TextInput
                    placeholder="Suffix to add to all slugs"
                    value={slugSuffix}
                    onChange={(event) => setSlugSuffix(event.currentTarget.value)}
                  />
                </Stack>
              </Box>
            </Flex>
            
            <Checkbox
              checked={replaceExisting}
              onChange={(event) => setReplaceExisting(event.currentTarget.checked)}
            >
              Replace existing slugs
            </Checkbox>
          </Stack>
        </Card>

        {/* Search Configuration */}
        <Stack space={3}>
          <Text weight="semibold">Search Configuration</Text>
          
          <Checkbox
            checked={useCustomQuery}
            onChange={(event) => setUseCustomQuery(event.currentTarget.checked)}
          >
            Use custom GROQ query
          </Checkbox>
          
          {useCustomQuery ? (
            <TextArea
              placeholder="Enter GROQ query (e.g., *[_type == 'post' && defined(title)])..."
              value={customGroqQuery}
              onChange={(event) => setCustomGroqQuery(event.currentTarget.value)}
              rows={3}
            />
          ) : (
            <TextInput
              placeholder="Search in title, name, or other fields..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              onKeyPress={(event) => event.key === 'Enter' && scanForDocuments()}
            />
          )}
          
          <Button
            text="Scan for Documents"
            onClick={scanForDocuments}
            disabled={isScanning || isLoading}
            tone="primary"
            icon={SearchIcon}
          />
        </Stack>

        {/* Results */}
        {documentsToConvert.length > 0 && (
          <Card padding={3} tone="transparent">
            <Stack space={3}>
              <Flex align="center" gap={2}>
                <Text weight="semibold">Documents to Convert</Text>
                <Badge tone="primary">{documentsToConvert.length} documents</Badge>
              </Flex>
              
              <Box style={{ maxHeight: '200px', overflow: 'auto' }}>
                <Stack space={2}>
                  {documentsToConvert.slice(0, 10).map((doc, index) => {
                    const sourceText = doc[sourceField] || doc.title || doc.name || doc._id
                    const previewSlug = generateSlug(sourceText)
                    
                    return (
                      <Card key={doc._id || index} padding={2} tone="default">
                        <Stack space={1}>
                          <Flex justify="space-between" align="center">
                            <Text size={1}>
                              <strong>{doc._type}</strong>: {doc.title || doc.name || doc._id}
                            </Text>
                          </Flex>
                          <Text size={1} muted>
                            Will generate: <code>{previewSlug}</code>
                          </Text>
                        </Stack>
                      </Card>
                    )
                  })}
                  {documentsToConvert.length > 10 && (
                    <Text size={1} muted>...and {documentsToConvert.length - 10} more documents</Text>
                  )}
                </Stack>
              </Box>
              
              <Button
                text={dryRun ? 'Preview Conversion' : 'Convert to Slugs'}
                onClick={convertToSlugs}
                disabled={isLoading || isScanning}
                tone="positive"
                icon={TransferIcon}
              />
            </Stack>
          </Card>
        )}

        {/* Status */}
        {(isLoading || isScanning || message) && (
          <Card padding={3} tone={isLoading || isScanning ? 'primary' : 'positive'}>
            <Flex align="center" gap={2}>
              {(isLoading || isScanning) && <Spinner />}
              <Text>{message}</Text>
            </Flex>
          </Card>
        )}

        {/* Settings */}
        <Card padding={3} tone="transparent">
          <Stack space={2}>
            <Text weight="semibold" size={1}>Settings</Text>
            <Flex gap={3} align="center">
              <Checkbox checked={dryRun} readOnly>
                Dry run mode: {dryRun ? 'ON' : 'OFF'}
              </Checkbox>
              <Text size={1} muted>Batch size: {batchSize}</Text>
              <Text size={1} muted>Max documents: {maxDocuments}</Text>
            </Flex>
          </Stack>
        </Card>

        {/* Info */}
        <Card padding={3} tone="transparent">
          <Stack space={2}>
            <Text weight="semibold" size={1}>Slug Generation Rules</Text>
            <Text size={1} muted>
              • Converts to lowercase
            </Text>
            <Text size={1} muted>
              • Replaces spaces and special characters with hyphens
            </Text>
            <Text size={1} muted>
              • Removes leading/trailing hyphens
            </Text>
            <Text size={1} muted>
              • Adds timestamp suffix if slug already exists
            </Text>
          </Stack>
        </Card>
      </Stack>
    </Card>
  )
}

export default ConvertIdsToSlugs