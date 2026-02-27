import { Fragment, useState, useEffect, useRef } from 'react'
import './QCMatrix.css'
import { API_ENDPOINTS } from '../config/api'
import { forceRelogin, isAuthErrorResponse } from '../utils/authUtils'

// Cache storage (shared across component mounts)
const qcDataCache = {
    data: null,
    folderFiles: null,
    timestamp: null,
    CACHE_DURATION: 5 * 60 * 1000 // 5 minutes in milliseconds
}

function QCMatrix({ session, user, rootFolderId }) {
    const [qcData, setQcData] = useState([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState(null)
    const [folderFiles, setFolderFiles] = useState({})
    const [expandedFolders, setExpandedFolders] = useState(new Set())
    const [todoItems, setTodoItems] = useState([])
    const [selectedTodo, setSelectedTodo] = useState(null)
    const [showTodoModal, setShowTodoModal] = useState(false)
    const [selectedFile, setSelectedFile] = useState(null)
    const [showReuploadModal, setShowReuploadModal] = useState(false)
    const [showActionsModal, setShowActionsModal] = useState(false)
    const [fileActions, setFileActions] = useState([])
    const [loadingCommentHistory, setLoadingCommentHistory] = useState(false)
    const [rejectComment, setRejectComment] = useState('')
    const [reuploadFile, setReuploadFile] = useState(null)
    const [reuploadFilename, setReuploadFilename] = useState('')
    const [reuploading, setReuploading] = useState(false)
    const [deletingFile, setDeletingFile] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [reuploadResult, setReuploadResult] = useState(null)
    const hasFetchedRef = useRef(false)

    const getTypeFromCategory = (category) => {
        const normalizedCategory = String(category || '').toLowerCase()

        if (normalizedCategory.includes('key visual')) return 'KV'
        if (normalizedCategory.includes('tech shot')) return 'TS'
        if (normalizedCategory.includes('supporting')) return 'SI'
        if (normalizedCategory.includes('t01')) return 'T01'
        if (normalizedCategory.includes('t02')) return 'T02'
        if (normalizedCategory.includes('t03')) return 'T03'

        return 'Unknown'
    }

    const normalizeValue = (value) => String(value || '').normalize('NFC').trim().toLowerCase()
    const normalizePath = (value) => String(value || '')
        .normalize('NFC')
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean)
        .join('/')
        .toLowerCase()

    const buildFolderPathById = (matrixItems = []) => {
        return (matrixItems || []).reduce((acc, item) => {
            if (item?.folder_id && item?.path) {
                acc[item.folder_id] = item.path
            }
            return acc
        }, {})
    }

    const buildLiveFileRows = (filesByFolder = {}, matrixItems = []) => {
        const folderPathById = buildFolderPathById(matrixItems)
        return Object.entries(filesByFolder || {}).flatMap(([folderId, rows]) =>
            (rows || []).map((row) => {
                const resolvedFolderId = row.folder_id || folderId
                return {
                    ...row,
                    folder_id: resolvedFolderId,
                    path: row.path || folderPathById[resolvedFolderId] || ''
                }
            })
        )
    }

    const resolveTodoWithLiveData = (todo, liveFiles = [], folderPathById = {}) => {
        let resolved = { ...todo }
        const normalizedTodoPath = normalizePath(todo.path)
        const normalizedTodoFilename = normalizeValue(todo.filename)
        const normalizedTodoComment = normalizeValue(todo.comment)

        const assignFromCandidate = (candidate) => {
            if (!candidate) return
            resolved = {
                ...resolved,
                live_file_id: candidate.file_id || resolved.live_file_id || null,
                folder_id: candidate.folder_id || resolved.folder_id || null,
                path: candidate.path || resolved.path || ''
            }
        }

        const byExactId = (todo.file_id && liveFiles.find((file) => file.file_id === todo.file_id)) || null
        assignFromCandidate(byExactId)

        if (!resolved.path || !resolved.folder_id || !resolved.live_file_id) {
            const pathMatches = normalizedTodoPath
                ? liveFiles.filter((file) => {
                    const normalizedFilePath = normalizePath(file.path)
                    return normalizedFilePath === normalizedTodoPath
                        || normalizedFilePath.endsWith(normalizedTodoPath)
                        || normalizedTodoPath.endsWith(normalizedFilePath)
                })
                : []

            if (pathMatches.length > 0) {
                const pathAndNameMatch = normalizedTodoFilename
                    ? pathMatches.find((file) => normalizeValue(file.filename) === normalizedTodoFilename)
                    : null
                assignFromCandidate(pathAndNameMatch || (pathMatches.length === 1 ? pathMatches[0] : null))
            }
        }

        if (!resolved.path || !resolved.folder_id || !resolved.live_file_id) {
            const exactCommentMatches = normalizedTodoFilename && normalizedTodoComment
                ? liveFiles.filter((file) =>
                    normalizeValue(file.filename) === normalizedTodoFilename
                    && String(file.latest_action_type || '').toLowerCase() === 'comment'
                    && normalizeValue(file.latest_comment) === normalizedTodoComment
                )
                : []

            if (exactCommentMatches.length === 1) {
                assignFromCandidate(exactCommentMatches[0])
            }
        }

        if (!resolved.path || !resolved.folder_id || !resolved.live_file_id) {
            const filenameMatches = normalizedTodoFilename
                ? liveFiles.filter((file) => normalizeValue(file.filename) === normalizedTodoFilename)
                : []
            if (filenameMatches.length === 1) {
                assignFromCandidate(filenameMatches[0])
            }
        }

        if (!resolved.folder_id && resolved.path) {
            const normalizedResolvedPath = normalizePath(resolved.path)
            const matchedFolderId = Object.entries(folderPathById).find(([, folderPath]) => {
                const normalizedFolderPath = normalizePath(folderPath)
                return normalizedFolderPath === normalizedResolvedPath
                    || normalizedFolderPath.endsWith(normalizedResolvedPath)
                    || normalizedResolvedPath.endsWith(normalizedFolderPath)
            })?.[0]

            if (matchedFolderId) {
                resolved.folder_id = matchedFolderId
            }
        }

        if (!resolved.path && resolved.folder_id) {
            resolved.path = folderPathById[resolved.folder_id] || ''
        }

        if (!resolved.live_file_id && resolved.file_id) {
            const liveMatch = liveFiles.find((file) => file.file_id === resolved.file_id)
            if (liveMatch?.file_id) {
                resolved.live_file_id = liveMatch.file_id
                resolved.path = resolved.path || liveMatch.path || ''
                resolved.folder_id = resolved.folder_id || liveMatch.folder_id || null
            }
        }

        return resolved
    }

    const toStatusClass = (prefix, status) => {
        const normalized = String(status || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
        return `${prefix}-${normalized || 'pending'}`
    }

    const buildFolderQcSummary = (filesInFolder) => {
        const totalFiles = filesInFolder.length
        const approvedFiles = filesInFolder.filter((file) => file.qc_status === 'APPROVED' || Number(file.approval_count || 0) >= 3).length
        const commentedFiles = filesInFolder.filter((file) => file.latest_action_type === 'comment').length
        const pendingReviewFiles = Math.max(totalFiles - approvedFiles, 0)

        let folderStatus = 'Pending'
        if (totalFiles > 0 && approvedFiles === totalFiles) {
            folderStatus = 'APPROVED'
        } else if (commentedFiles > 0) {
            folderStatus = `Pending (Comments: ${pendingReviewFiles})`
        } else if (approvedFiles > 0) {
            folderStatus = `${approvedFiles}/${totalFiles} Files Approved`
        } else if (totalFiles > 0) {
            folderStatus = `Pending (${pendingReviewFiles})`
        }

        return {
            totalFiles,
            approvedFiles,
            commentedFiles,
            pendingReviewFiles,
            folderStatus
        }
    }

    const normalizeFileWithQc = (file, baseMeta, qcRecordMap) => {
        const qcRecord = qcRecordMap[file.id] || {}
        const approvalCount = Number(qcRecord.approval_count || 0)
        const qcStatus = qcRecord.status || (approvalCount >= 3 ? 'APPROVED' : (approvalCount > 0 ? `${approvalCount}/3 Approved` : 'Pending'))

        return {
            file_id: file.id,
            filename: file.name,
            web_view_link: file.webViewLink,
            mime_type: file.mimeType,
            created_time: file.createdTime,
            modified_time: file.modifiedTime,
            approval_count: approvalCount,
            qc_status: qcStatus,
            latest_action_type: qcRecord.latest_action_type || null,
            latest_comment: qcRecord.latest_comment || '',
            latest_comment_at: qcRecord.latest_comment_at || null,
            latest_action_at: qcRecord.latest_action_at || null,
            ...baseMeta
        }
    }

    const getLatestFolderComment = (filesInFolder) => {
        let latest = null
        for (const file of filesInFolder) {
            if (!file?.latest_comment) continue
            const ts = Date.parse(file.latest_comment_at || file.latest_action_at || '') || 0
            if (!latest || ts > latest.ts) {
                latest = { ts, comment: String(file.latest_comment).trim() }
            }
        }
        return latest?.comment || ''
    }

    const fetchFilesByFolders = async (folderIds) => {
        if (!folderIds.length) {
            return { files_by_folder: {}, counts: {} }
        }

        const response = await fetch(API_ENDPOINTS.DRIVE_FILES_BY_FOLDERS, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'X-Google-Token': session.provider_token || '',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ folder_ids: folderIds })
        })

        const data = await response.json()

        if (isAuthErrorResponse(response, data)) {
            await forceRelogin()
            return null
        }

        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch files by folders')
        }

        return {
            files_by_folder: data.files_by_folder || {},
            counts: data.counts || {}
        }
    }

    const fetchQcRecords = async () => {
        const response = await fetch(API_ENDPOINTS.QC_RECORDS, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'X-Google-Token': session.provider_token || '',
                'Content-Type': 'application/json'
            }
        })

        const data = await response.json()

        if (isAuthErrorResponse(response, data)) {
            await forceRelogin()
            return null
        }

        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch QC records')
        }

        const records = data.records || []
        return records.reduce((acc, record) => {
            if (record?.file_id) {
                acc[record.file_id] = record
            }
            return acc
        }, {})
    }

    const fetchTodoItems = async () => {
        const response = await fetch(API_ENDPOINTS.QC_TODO, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'X-Google-Token': session.provider_token || '',
                'Content-Type': 'application/json'
            }
        })

        const data = await response.json()

        if (isAuthErrorResponse(response, data)) {
            await forceRelogin()
            return null
        }

        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch QC ToDo items')
        }

        return data.todo || []
    }

    // Filter State
    const [filters, setFilters] = useState({
        status: 'All',
        pack: 'All',
        model: 'All',
        category: 'All'
    })

    // Fetch QC data on mount (with caching)
    useEffect(() => {
        if (hasFetchedRef.current) return
        hasFetchedRef.current = true

        // Always fetch fresh on mount so UI reflects latest Drive state.
        fetchQCData()
    }, [session])

    const fetchQCData = async () => {
        if (!session) {
            setError('Not authenticated')
            setLoading(false)
            return
        }

        try {
            setLoading(true)

            console.log('Fetching QC data using /api/drive/check-structure...')

            // Use the same endpoint as Directory Structure (FAST!)
            const response = await fetch(API_ENDPOINTS.DRIVE_CHECK_STRUCTURE, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'X-Google-Token': session.provider_token || '',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(rootFolderId ? { root_folder_id: rootFolderId } : {})
            })

            const data = await response.json()

            if (isAuthErrorResponse(response, data)) {
                await forceRelogin()
                return
            }

            if (data.success) {
                const { existing, missing } = data

                // Keep only full paths (exclude root/category rows like "1. ELITE" or "1. ELITE/1. Key Visual").
                // Full path starts at model level: Pack/Category/Model... (3+ path segments).
                const hasFullPathDepth = (path) => String(path || '').split('/').length >= 3

                const filteredExisting = existing.filter((item) => hasFullPathDepth(item.path))
                const filteredMissing = missing.filter((item) => hasFullPathDepth(item.path))
                const filteredSummary = {
                    total: filteredExisting.length + filteredMissing.length,
                    existing_count: filteredExisting.length,
                    missing_count: filteredMissing.length
                }

                const folderIds = filteredExisting
                    .map((item) => item.folder_id)
                    .filter(Boolean)

                const folderPayload = await fetchFilesByFolders(folderIds)
                if (folderPayload === null) {
                    return
                }

                const filesByFolder = folderPayload.files_by_folder || {}
                const liveFileIds = Object.values(filesByFolder)
                    .flatMap((filesInFolder) => filesInFolder || [])
                    .map((file) => file?.id)
                    .filter(Boolean)

                const reconcileResponse = await fetch(API_ENDPOINTS.QC_RECONCILE_LIVE_FILES, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'X-Google-Token': session.provider_token || '',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ live_file_ids: liveFileIds })
                })
                const reconcileData = await reconcileResponse.json()
                if (isAuthErrorResponse(reconcileResponse, reconcileData)) {
                    await forceRelogin()
                    return
                }
                if (!reconcileData.success) {
                    throw new Error(reconcileData.error || 'Failed to reconcile stale QC data')
                }

                const [qcRecordMap, todoFromDb] = await Promise.all([
                    fetchQcRecords(),
                    fetchTodoItems()
                ])
                if (qcRecordMap === null || todoFromDb === null) {
                    return
                }
                const preloadedFolderFiles = {}

                // Parse each existing path to extract metadata
                const qcItems = filteredExisting.map((item, index) => {
                    const pathParts = item.path.split('/')

                    // Parse path: "1. ELITE/1. Key Visual/Model Name"
                    const pack = pathParts[0] || 'Unknown'
                    const category = pathParts[1] || 'Unknown'
                    const model = pathParts[2] || 'Unknown'

                    const type = getTypeFromCategory(category)
                    const expectedFiles = 1
                    const normalizedFiles = (filesByFolder[item.folder_id] || []).map((file) => normalizeFileWithQc(file, {
                        path: item.path,
                        folder_id: item.folder_id
                    }, qcRecordMap))
                    preloadedFolderFiles[item.folder_id] = normalizedFiles
                    const folderSummary = buildFolderQcSummary(normalizedFiles)
                    const fileCount = folderSummary.totalFiles
                    const uploadStatus = fileCount >= expectedFiles
                        ? 'Complete'
                        : fileCount > 0
                            ? 'Partial'
                            : 'Empty'

                    return {
                        id: `${item.folder_id}-${index}`,
                        path: item.path,
                        folder_id: item.folder_id,
                        pack: pack,
                        category: category,
                        model: model,
                        type: type,
                        file_count: fileCount,
                        expected_files: expectedFiles,
                        upload_status: uploadStatus,
                        approved_file_count: folderSummary.approvedFiles,
                        commented_file_count: folderSummary.commentedFiles,
                        pending_review_count: folderSummary.pendingReviewFiles,
                        latest_comment_preview: getLatestFolderComment(normalizedFiles),
                        qc_status: folderSummary.folderStatus
                    }
                })

                // Add missing folders to the list
                const missingItems = filteredMissing.map((item, index) => {
                    const pathParts = item.path.split('/')
                    const pack = pathParts[0] || 'Unknown'
                    const category = pathParts[1] || 'Unknown'
                    const model = pathParts[2] || 'Unknown'

                    const type = getTypeFromCategory(category)

                    return {
                        id: `missing-${index}`,
                        path: item.path,
                        folder_id: null,
                        pack: pack,
                        category: category,
                        model: model,
                        type: type,
                        file_count: 0,
                        expected_files: 1,
                        upload_status: 'Missing',
                        approved_file_count: 0,
                        commented_file_count: 0,
                        pending_review_count: 0,
                        latest_comment_preview: '',
                        qc_status: 'Pending'
                    }
                })

                const allItems = [...qcItems, ...missingItems]
                const totalUploadedFiles = qcItems.reduce((sum, item) => sum + Number(item.file_count || 0), 0)
                const totalApprovedFiles = qcItems.reduce((sum, item) => sum + Number(item.approved_file_count || 0), 0)
                const fullyApprovedFolders = qcItems.filter((item) => item.qc_status === 'APPROVED').length

                const folderPathById = buildFolderPathById(allItems)
                const liveFileRows = buildLiveFileRows(preloadedFolderFiles, allItems)
                const resolvedTodoItems = (todoFromDb || []).map((todo) => resolveTodoWithLiveData(todo, liveFileRows, folderPathById))

                const newData = {
                    stats: {
                        total_expected: filteredSummary.total,
                        uploaded: filteredSummary.existing_count,
                        missing: filteredSummary.missing_count,
                        upload_percentage: filteredSummary.total > 0
                            ? Math.round((filteredSummary.existing_count / filteredSummary.total) * 100)
                            : 0,
                        total_uploaded_files: totalUploadedFiles,
                        total_approved_files: totalApprovedFiles,
                        fully_approved_folders: fullyApprovedFolders
                    },
                    files: allItems
                }

                // Update state
                setQcData(newData)
                setFolderFiles(preloadedFolderFiles)
                setError(null)
                setTodoItems(resolvedTodoItems)

                // Save to cache
                qcDataCache.data = newData
                qcDataCache.folderFiles = preloadedFolderFiles
                qcDataCache.timestamp = Date.now()
                console.log('QC data cached for 5 minutes')
            } else {
                setError(data.error || 'Failed to fetch QC data')
            }
        } catch (err) {
            setError(`Error fetching QC data: ${err.message}`)
            console.error('QC fetch error:', err)
        } finally {
            setLoading(false)
        }
    }

    // Extract stats if available
    const stats = qcData?.stats || {
        total_expected: 0,
        uploaded: 0,
        missing: 0,
        upload_percentage: 0,
        total_uploaded_files: 0,
        total_approved_files: 0,
        fully_approved_folders: 0
    }
    const files = qcData?.files || []

    // Extract unique values for filters
    const packs = ['All', ...new Set(files.map(item => item.pack).filter(p => p !== 'Unknown'))]
    const models = ['All', ...new Set(files.map(item => item.model).filter(m => m !== 'Unknown'))]
    const categories = ['All', ...new Set(files.map(item => item.category).filter(c => c !== 'Unknown'))]
    const statuses = ['All', 'APPROVED', 'Pending', 'In Progress']

    // Filter Logic
    const filteredData = files.filter(item => {
        const statusMatch = filters.status === 'All'
            ? true
            : filters.status === 'In Progress'
                ? item.qc_status.includes('/') || item.qc_status.includes('Comments')
                : item.qc_status === filters.status
        const packMatch = filters.pack === 'All' || item.pack === filters.pack
        const modelMatch = filters.model === 'All' || item.model === filters.model
        const categoryMatch = filters.category === 'All' || item.category === filters.category
        return statusMatch && packMatch && modelMatch && categoryMatch
    })

    // Dashboard Statistics
    const totalPaths = filteredData.length
    const completePaths = filteredData.filter((f) => f.upload_status === 'Complete').length
    const fullyApprovedFolders = filteredData.filter((f) => f.qc_status === 'APPROVED').length
    const folderApprovalRate = totalPaths > 0 ? Math.round((fullyApprovedFolders / totalPaths) * 100) : 0
    const totalUploadedFiles = filteredData.reduce((sum, item) => sum + Number(item.file_count || 0), 0)
    const totalApprovedFiles = filteredData.reduce((sum, item) => sum + Number(item.approved_file_count || 0), 0)
    const fileApprovalRate = totalUploadedFiles > 0 ? Math.round((totalApprovedFiles / totalUploadedFiles) * 100) : 0
    const todoCount = todoItems.length

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }))
    }

    const resetFilters = () => {
        setFilters({
            status: 'All',
            pack: 'All',
            model: 'All',
            category: 'All'
        })
    }

    const handleRefresh = async () => {
        setRefreshing(true)
        // Clear cache to force fresh fetch
        qcDataCache.data = null
        qcDataCache.folderFiles = null
        qcDataCache.timestamp = null
        setExpandedFolders(new Set())
        setFolderFiles({})
        await fetchQCData()
        setRefreshing(false)
    }

    const togglePathFiles = async (pathItem) => {
        if (!pathItem.folder_id || pathItem.file_count <= 0) {
            return
        }

        const folderId = pathItem.folder_id

        setExpandedFolders((prev) => {
            const next = new Set(prev)
            if (next.has(folderId)) {
                next.delete(folderId)
            } else {
                next.add(folderId)
            }
            return next
        })
    }

    const handleApprove = async (fileItem) => {
        if (!session) {
            alert('Not authenticated')
            return
        }

        try {
            const response = await fetch(API_ENDPOINTS.QC_APPROVE, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'X-Google-Token': session.provider_token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    file_id: fileItem.file_id,
                    filename: fileItem.filename,
                    web_view_link: fileItem.web_view_link,
                    mime_type: fileItem.mime_type
                })
            })

            const data = await response.json()

            if (isAuthErrorResponse(response, data)) {
                await forceRelogin()
                return
            }

            if (data.success) {
                const newApprovals = Number(data.approval_count || 0)
                const newStatus = data.status || (newApprovals >= 3 ? 'APPROVED' : (newApprovals > 0 ? `${newApprovals}/3 Approved` : 'Pending'))
                let updatedFilesForFolder = []
                setFolderFiles((prev) => {
                    const folderId = fileItem.folder_id
                    const existingFiles = prev[folderId] || []
                    updatedFilesForFolder = existingFiles.map((file) =>
                        file.file_id === fileItem.file_id
                            ? {
                                ...file,
                                approval_count: newApprovals,
                                qc_status: newStatus,
                                latest_action_type: 'approve',
                                latest_comment: file.latest_comment || '',
                                latest_comment_at: file.latest_comment_at || null
                            }
                            : file
                    )

                    if (!existingFiles.some((file) => file.file_id === fileItem.file_id)) {
                        updatedFilesForFolder = [
                            ...existingFiles,
                            {
                                ...fileItem,
                                approval_count: newApprovals,
                                qc_status: newStatus,
                                latest_action_type: 'approve',
                                latest_comment: fileItem.latest_comment || '',
                                latest_comment_at: fileItem.latest_comment_at || null
                            }
                        ]
                    }

                    return {
                        ...prev,
                        [folderId]: updatedFilesForFolder
                    }
                })

                const folderSummary = buildFolderQcSummary(updatedFilesForFolder)
                setQcData((prevData) => ({
                    ...prevData,
                    files: (prevData.files || []).map((item) =>
                        item.folder_id === fileItem.folder_id
                            ? {
                                ...item,
                                file_count: folderSummary.totalFiles,
                                approved_file_count: folderSummary.approvedFiles,
                                commented_file_count: folderSummary.commentedFiles,
                                pending_review_count: folderSummary.pendingReviewFiles,
                                latest_comment_preview: getLatestFolderComment(updatedFilesForFolder),
                                qc_status: folderSummary.folderStatus
                            }
                            : item
                    )
                }))
                if (!data.duplicate_approval) {
                    setTodoItems((prev) => prev.filter((item) => item.file_id !== fileItem.file_id))
                }
                qcDataCache.data = null
                qcDataCache.folderFiles = null
                qcDataCache.timestamp = null
                alert(data.message || `Approval recorded (${newApprovals}/3)`)
            } else {
                alert(`Error: ${data.error}`)
            }
        } catch (err) {
            alert(`Error approving file: ${err.message}`)
            console.error(err)
        }
    }

    const handleReject = async (fileItem) => {
        if (!rejectComment.trim()) {
            alert('Please enter a comment')
            return
        }

        if (!session) {
            alert('Not authenticated')
            return
        }

        try {
            const response = await fetch(API_ENDPOINTS.QC_COMMENT || API_ENDPOINTS.QC_REJECT, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'X-Google-Token': session.provider_token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    file_id: fileItem.file_id,
                    filename: fileItem.filename,
                    web_view_link: fileItem.web_view_link,
                    comment: rejectComment
                })
            })

            const data = await response.json()

            if (isAuthErrorResponse(response, data)) {
                await forceRelogin()
                return
            }

            if (data.success) {
                let updatedFilesForFolder = []
                setFolderFiles((prev) => {
                    const folderId = fileItem.folder_id
                    const existingFiles = prev[folderId] || []
                    updatedFilesForFolder = existingFiles.map((file) =>
                        file.file_id === fileItem.file_id
                            ? {
                                ...file,
                                approval_count: 0,
                                qc_status: 'Pending',
                                latest_action_type: 'comment',
                                latest_comment: rejectComment,
                                latest_comment_at: new Date().toISOString()
                            }
                            : file
                    )

                    if (!existingFiles.some((file) => file.file_id === fileItem.file_id)) {
                        updatedFilesForFolder = [
                            ...existingFiles,
                            {
                                ...fileItem,
                                approval_count: 0,
                                qc_status: 'Pending',
                                latest_action_type: 'comment',
                                latest_comment: rejectComment,
                                latest_comment_at: new Date().toISOString()
                            }
                        ]
                    }

                    return {
                        ...prev,
                        [folderId]: updatedFilesForFolder
                    }
                })

                const folderSummary = buildFolderQcSummary(updatedFilesForFolder)
                setQcData((prevData) => ({
                    ...prevData,
                    files: (prevData.files || []).map((item) =>
                        item.folder_id === fileItem.folder_id
                            ? {
                                ...item,
                                file_count: folderSummary.totalFiles,
                                approved_file_count: folderSummary.approvedFiles,
                                commented_file_count: folderSummary.commentedFiles,
                                pending_review_count: folderSummary.pendingReviewFiles,
                                latest_comment_preview: getLatestFolderComment(updatedFilesForFolder),
                                qc_status: folderSummary.folderStatus
                            }
                            : item
                    )
                }))
                setTodoItems((prev) => [
                    {
                        file_id: fileItem.file_id,
                        filename: fileItem.filename,
                        path: fileItem.path,
                        folder_id: fileItem.folder_id,
                        web_view_link: fileItem.web_view_link,
                        comment: rejectComment,
                        created_at: new Date().toISOString()
                    },
                    ...prev.filter((item) => item.file_id !== fileItem.file_id)
                ])
                setRejectComment('')
                setShowReuploadModal(false)
                qcDataCache.data = null
                qcDataCache.folderFiles = null
                qcDataCache.timestamp = null
                alert(data.message || `Comment saved by ${user?.email}`)
            } else {
                alert(`Error: ${data.error}`)
            }
        } catch (err) {
            alert(`Error saving comment: ${err.message}`)
            console.error(err)
        }
    }

    const fetchFileActions = async (fileId) => {
        const response = await fetch(`${API_ENDPOINTS.QC_ACTIONS}/${fileId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'X-Google-Token': session.provider_token,
                'Content-Type': 'application/json'
            }
        })

        const data = await response.json()

        if (isAuthErrorResponse(response, data)) {
            await forceRelogin()
            return null
        }

        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch actions')
        }

        return data.actions || []
    }

    const handleViewActions = async (fileItem) => {
        if (!session) {
            alert('Not authenticated')
            return
        }

        try {
            const actions = await fetchFileActions(fileItem.file_id)
            if (actions === null) return

            setFileActions(actions)
            setSelectedFile(fileItem)
            setShowActionsModal(true)
        } catch (err) {
            alert(`Error fetching actions: ${err.message}`)
            console.error(err)
        }
    }

    const openCommentModal = async (fileItem) => {
        setSelectedFile(fileItem)
        setRejectComment('')
        setLoadingCommentHistory(true)
        setShowReuploadModal(true)

        try {
            if (!fileItem?.file_id) {
                setFileActions([])
                return
            }

            const actions = await fetchFileActions(fileItem.file_id)
            if (actions === null) return
            setFileActions(actions)
        } catch (err) {
            alert(`Error loading previous comments: ${err.message}`)
            setFileActions([])
        } finally {
            setLoadingCommentHistory(false)
        }
    }

    const openTodoModal = async (todo) => {
        try {
            let actions = []
            if (todo.file_id) {
                const fetched = await fetchFileActions(todo.file_id)
                if (fetched === null) return
                actions = fetched
            }

            const matrixItems = qcData?.files || []
            const folderPathById = buildFolderPathById(matrixItems)
            const allLiveFiles = buildLiveFileRows(folderFiles, matrixItems)
            const resolvedTodo = resolveTodoWithLiveData(todo, allLiveFiles, folderPathById)

            setFileActions(actions)
            setSelectedTodo(resolvedTodo)
            setReuploadFile(null)
            setReuploadFilename(resolvedTodo.filename || '')
            setReuploadResult(null)
            setConfirmDelete(false)
            setShowTodoModal(true)
        } catch (err) {
            alert(`Error loading QC details: ${err.message}`)
        }
    }

    const handleTodoReupload = async () => {
        if (!selectedTodo) return
        if (!reuploadFile) {
            alert('Please choose a file to upload')
            return
        }
        if (!reuploadFilename.trim()) {
            alert('Please enter a filename')
            return
        }
        if (reuploadFilename.trim() !== selectedTodo.filename) {
            setReuploadResult({
                success: false,
                message: 'Filename must match the original file name exactly.'
            })
            return
        }
        if (reuploadFile.name !== selectedTodo.filename) {
            setReuploadResult({
                success: false,
                message: `Selected file name must be "${selectedTodo.filename}".`
            })
            return
        }

        try {
            setReuploading(true)
            setReuploadResult(null)

            const formData = new FormData()
            formData.append('file', reuploadFile)
            formData.append('filename', reuploadFilename.trim())
            formData.append('overwrite', 'true')
            if (selectedTodo.live_file_id || selectedTodo.file_id) {
                formData.append('target_file_id', selectedTodo.live_file_id || selectedTodo.file_id)
            }

            const response = await fetch(API_ENDPOINTS.DRIVE_UPLOAD, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'X-Google-Token': session.provider_token
                },
                body: formData
            })
            const data = await response.json()

            if (isAuthErrorResponse(response, data)) {
                await forceRelogin()
                return
            }

            if (!response.ok || !data.success) {
                setReuploadResult({
                    success: false,
                    message: data.error || `Upload failed (${response.status})`
                })
                return
            }

            setReuploadResult({
                success: true,
                message: data.overwritten
                    ? `Overwritten: ${data.actual_filename || reuploadFilename}`
                    : `Uploaded: ${data.actual_filename || reuploadFilename}`,
                link: data.web_view_link
            })

            setTodoItems((prev) => prev.filter((item) => item.file_id !== selectedTodo.file_id))
            setShowTodoModal(false)
            setSelectedTodo(null)
            await handleRefresh()
        } catch (err) {
            setReuploadResult({
                success: false,
                message: err.message || 'Upload failed'
            })
        } finally {
            setReuploading(false)
        }
    }

    const handleTodoDelete = async () => {
        if (!selectedTodo?.file_id && !selectedTodo?.live_file_id) {
            alert('No file identifier available for this todo item')
            return
        }

        if (!confirmDelete) {
            setConfirmDelete(true)
            return
        }

        try {
            setDeletingFile(true)
            setReuploadResult(null)

            let liveFileId = selectedTodo.live_file_id || null
            let resolvedFolderId = selectedTodo.folder_id || null
            let candidateFileIds = []
            const normalizedTodoFilename = normalizeValue(selectedTodo.filename)
            const selectedFolderId = selectedTodo.folder_id
            let folderFromSelection = selectedFolderId ? (folderFiles[selectedFolderId] || []) : []
            if (selectedFolderId && folderFromSelection.length === 0) {
                const liveFolderPayload = await fetchFilesByFolders([selectedFolderId])
                if (liveFolderPayload === null) {
                    return
                }
                const fetchedRows = (liveFolderPayload.files_by_folder?.[selectedFolderId] || []).map((file) => ({
                    file_id: file.id,
                    filename: file.name,
                    web_view_link: file.webViewLink,
                    mime_type: file.mimeType,
                    created_time: file.createdTime,
                    modified_time: file.modifiedTime,
                    folder_id: selectedFolderId,
                    path: selectedTodo.path || ''
                }))
                if (fetchedRows.length > 0) {
                    setFolderFiles((prev) => ({
                        ...prev,
                        [selectedFolderId]: fetchedRows
                    }))
                    folderFromSelection = fetchedRows
                }
            }
            if (folderFromSelection.length > 0) {
                const folderNameMatches = folderFromSelection.filter((f) => normalizeValue(f.filename) === normalizedTodoFilename)
                if (folderNameMatches[0]?.file_id) {
                    liveFileId = liveFileId || folderNameMatches[0].file_id
                    candidateFileIds = folderNameMatches.map((f) => f.file_id).filter(Boolean)
                } else if (folderFromSelection.length === 1 && folderFromSelection[0]?.file_id) {
                    liveFileId = liveFileId || folderFromSelection[0].file_id
                    candidateFileIds = [folderFromSelection[0].file_id]
                } else {
                    candidateFileIds = folderFromSelection.map((f) => f.file_id).filter(Boolean)
                }
            }

            if ((!liveFileId || candidateFileIds.length === 0) && selectedTodo.path) {
                const normalizedTodoPath = normalizePath(selectedTodo.path)
                const matchingPathRow = (qcData?.files || []).find((item) => {
                    const normalizedRowPath = normalizePath(item.path)
                    return normalizedRowPath === normalizedTodoPath
                        || normalizedRowPath.endsWith(normalizedTodoPath)
                        || normalizedTodoPath.endsWith(normalizedRowPath)
                })
                if (matchingPathRow?.folder_id) {
                    resolvedFolderId = matchingPathRow.folder_id
                    let liveFiles = folderFiles[matchingPathRow.folder_id] || []
                    if (liveFiles.length === 0) {
                        const liveFolderPayload = await fetchFilesByFolders([matchingPathRow.folder_id])
                        if (liveFolderPayload === null) {
                            return
                        }
                        liveFiles = (liveFolderPayload.files_by_folder?.[matchingPathRow.folder_id] || []).map((file) => ({
                            file_id: file.id,
                            filename: file.name,
                            web_view_link: file.webViewLink,
                            mime_type: file.mimeType,
                            created_time: file.createdTime,
                            modified_time: file.modifiedTime,
                            folder_id: matchingPathRow.folder_id,
                            path: matchingPathRow.path || selectedTodo.path || ''
                        }))
                        if (liveFiles.length > 0) {
                            setFolderFiles((prev) => ({
                                ...prev,
                                [matchingPathRow.folder_id]: liveFiles
                            }))
                        }
                    }
                    const nameMatches = liveFiles.filter((f) => normalizeValue(f.filename) === normalizedTodoFilename)
                    const nameMatch = nameMatches[0]
                    if (nameMatch?.file_id) {
                        liveFileId = nameMatch.file_id
                        candidateFileIds = nameMatches.map((f) => f.file_id).filter(Boolean)
                    } else if (liveFiles.length === 1 && liveFiles[0]?.file_id) {
                        // If path has exactly one file, use it as a safe fallback target.
                        liveFileId = liveFiles[0].file_id
                        candidateFileIds = [liveFiles[0].file_id]
                    } else {
                        candidateFileIds = liveFiles.map((f) => f.file_id).filter(Boolean)
                    }
                }
            }

            if (!liveFileId) {
                const allLiveFiles = Object.values(folderFiles).flatMap((rows) => rows || [])
                const filenameMatches = allLiveFiles.filter((f) => normalizeValue(f.filename) === normalizedTodoFilename)
                if (filenameMatches.length === 1) {
                    liveFileId = filenameMatches[0].file_id
                    resolvedFolderId = filenameMatches[0].folder_id || resolvedFolderId
                }
                if (!candidateFileIds.length) {
                    candidateFileIds = filenameMatches.map((f) => f.file_id).filter(Boolean)
                }
            }

            const deleteController = new AbortController()
            const deleteTimeoutId = setTimeout(() => deleteController.abort(), 30000)
            let response
            try {
                response = await fetch(API_ENDPOINTS.DRIVE_DELETE_FILE, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'X-Google-Token': session.provider_token,
                        'Content-Type': 'application/json'
                    },
                    signal: deleteController.signal,
                    body: JSON.stringify({
                        file_id: selectedTodo.file_id,
                        live_file_id: liveFileId,
                        candidate_file_ids: candidateFileIds,
                        filename: selectedTodo.filename,
                        folder_id: resolvedFolderId,
                        path: selectedTodo.path
                    })
                })
            } finally {
                clearTimeout(deleteTimeoutId)
            }
            const data = await response.json()

            if (isAuthErrorResponse(response, data)) {
                await forceRelogin()
                return
            }

            if (!response.ok || !data.success) {
                setReuploadResult({
                    success: false,
                    message: data.error || `Delete failed (${response.status})`
                })
                return
            }

            setReuploadResult({
                success: true,
                message: data.message || 'File deleted successfully'
            })

            setConfirmDelete(false)
            setTodoItems((prev) => prev.filter((item) => {
                if (selectedTodo.qc_id && item.qc_id) return item.qc_id !== selectedTodo.qc_id
                if (selectedTodo.file_id && item.file_id) return item.file_id !== selectedTodo.file_id
                return true
            }))
            setShowTodoModal(false)
            setSelectedTodo(null)
            handleRefresh().catch((refreshErr) => {
                console.error('Error refreshing after delete:', refreshErr)
            })
        } catch (err) {
            setReuploadResult({
                success: false,
                message: err?.name === 'AbortError'
                    ? 'Delete request timed out. Please try again.'
                    : (err.message || 'Delete failed')
            })
        } finally {
            setDeletingFile(false)
        }
    }

    if (loading) {
        return (
            <div className="qc-matrix">
                <div className="qc-header">
                    <h2>🔍 Quality Control Matrix</h2>
                </div>
                <div style={{ padding: '2rem', textAlign: 'center' }}>Loading QC data...</div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="qc-matrix">
                <div className="qc-header">
                    <h2>🔍 Quality Control Matrix</h2>
                </div>
                <div style={{ padding: '2rem', color: '#ff0055' }}>Error: {error}</div>
            </div>
        )
    }

    return (
        <div className="qc-matrix">
            <div className="qc-header">
                <h2>🔍 Quality Control Matrix</h2>
                <div className="header-controls">
                    <div className="filter-group">
                        <select
                            value={filters.status}
                            onChange={(e) => handleFilterChange('status', e.target.value)}
                            className="filter-select"
                        >
                            {statuses.map(s => <option key={s} value={s}>{s === 'All' ? 'Filter: Status' : s}</option>)}
                        </select>
                        <select
                            value={filters.pack}
                            onChange={(e) => handleFilterChange('pack', e.target.value)}
                            className="filter-select"
                        >
                            {packs.map(p => <option key={p} value={p}>{p === 'All' ? 'Filter: Pack' : p}</option>)}
                        </select>
                        <select
                            value={filters.model}
                            onChange={(e) => handleFilterChange('model', e.target.value)}
                            className="filter-select"
                        >
                            {models.map(m => <option key={m} value={m}>{m === 'All' ? 'Filter: Model' : m}</option>)}
                        </select>
                        <select
                            value={filters.category}
                            onChange={(e) => handleFilterChange('category', e.target.value)}
                            className="filter-select"
                        >
                            {categories.map(c => <option key={c} value={c}>{c === 'All' ? 'Filter: Category' : c}</option>)}
                        </select>
                        <button onClick={resetFilters} className="btn-reset">Reset</button>
                        <button
                            onClick={handleRefresh}
                            className="btn-refresh"
                            disabled={refreshing}
                        >
                            {refreshing ? '🔄 Refreshing...' : '🔄 Refresh'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mini Dashboard */}
            <div className="dashboard-grid">
                <div className="dash-card total-card">
                    <div className="card-lbl">Total Folders</div>
                    <div className="card-val">{totalPaths}</div>
                    <div className="card-sub">Model Folders</div>
                </div>
                <div className="dash-card success-card">
                    <div className="card-lbl">Uploaded Files</div>
                    <div className="card-val">{totalUploadedFiles}</div>
                    <div className="card-sub">{completePaths}/{totalPaths} Folders Have Files</div>
                </div>
                <div className="dash-card warning-card">
                    <div className="card-lbl">Approved Files</div>
                    <div className="card-val">{totalApprovedFiles}</div>
                    <div className="card-sub">{fileApprovalRate}% File QC Complete</div>
                </div>
                <div className="dash-card info-card">
                    <div className="card-lbl">Folders Approved</div>
                    <div className="card-val">{fullyApprovedFolders}/{totalPaths}</div>
                    <div className="card-sub">{folderApprovalRate}% Folder QC Complete</div>
                </div>
                <div className="dash-card status-card">
                    <div className="card-lbl">Structure</div>
                    <div className="card-val">{stats.uploaded}/{stats.total_expected}</div>
                    <div className="card-sub">{stats.upload_percentage}% Built | {todoCount} ToDo</div>
                </div>
            </div>

            <div className="qc-content">
                {/* QC Matrix Table */}
                <div className="matrix-section">
                    <div className="matrix-header-bar">
                        <h3>📊 Quality Control Matrix ({filteredData.length} folders)</h3>
                    </div>

                    <div className="table-container">
                        <table className="qc-table">
                            <thead>
                                <tr>
                                    <th>Pack</th>
                                    <th>Category</th>
                                    <th>Model</th>
                                    <th>Type</th>
                                    <th>Path</th>
                                    <th>Uploaded Files</th>
                                    <th>Approval Progress</th>
                                    <th>Folder QC Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                                            No folders found. Create directory structure to see paths here.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredData.map((item) => {
                                        const isExpanded = item.folder_id ? expandedFolders.has(item.folder_id) : false
                                        const files = item.folder_id ? (folderFiles[item.folder_id] || []) : []
                                        const isFilesLoading = false

                                        return (
                                            <Fragment key={item.id}>
                                                <tr>
                                                    <td className="pack-cell">{item.pack}</td>
                                                    <td className="category-cell">{item.category}</td>
                                                    <td className="model-cell">{item.model}</td>
                                                    <td className="type-cell">{item.type}</td>
                                                    <td className="path-cell">
                                                        <span className="path-text">{item.path}</span>
                                                    </td>
                                                    <td className="file-count-cell">
                                                        {item.file_count > 0 && item.folder_id ? (
                                                            <div className="uploaded-files-cell">
                                                                <button
                                                                    className="file-count-link"
                                                                    onClick={() => togglePathFiles(item)}
                                                                >
                                                                    {item.file_count} Uploaded {isExpanded ? 'Hide' : 'View'}
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className={item.file_count >= item.expected_files ? 'count-complete' : 'count-partial'}>
                                                                {item.file_count}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="approval-progress-cell">
                                                        <span className="approval-progress-text">
                                                            {item.file_count > 0 ? `${item.approved_file_count || 0}/${item.file_count} Files` : '0/0 Files'}
                                                        </span>
                                                    </td>
                                                    <td className="qc-status-cell">
                                                        <span className={`qc-badge ${toStatusClass('qc', item.qc_status)}`}>
                                                            {item.qc_status}
                                                        </span>
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr>
                                                        <td colSpan="8" className="folder-files-cell">
                                                            <div className="folder-files-panel">
                                                                <h4>Files in {item.path}</h4>
                                                                {isFilesLoading ? (
                                                                    <p className="folder-files-empty">Loading files...</p>
                                                                ) : files.length === 0 ? (
                                                                    <p className="folder-files-empty">No files found in this folder.</p>
                                                                ) : (
                                                                    <div className="folder-files-list">
                                                                        {files.map((file) => (
                                                                            <div key={file.file_id} className="folder-file-row">
                                                                                <div className="folder-file-main">
                                                                                    <a
                                                                                        href={file.web_view_link}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className="folder-file-link"
                                                                                    >
                                                                                        {file.filename}
                                                                                    </a>
                                                                                    <div className="folder-file-meta">
                                                                                        <span className="file-approval-progress">{Number(file.approval_count || 0)}/3 approvals</span>
                                                                                        <span className={`qc-badge ${toStatusClass('qc', file.qc_status || 'Pending')}`}>
                                                                                            {file.qc_status || 'Pending'}
                                                                                        </span>
                                                                                    </div>
                                                                                    {file.latest_comment && (
                                                                                        <p className="expanded-file-latest-comment" title={file.latest_comment}>
                                                                                            Latest comment: {file.latest_comment}
                                                                                        </p>
                                                                                    )}
                                                                                </div>
                                                                                <div className="folder-file-actions">
                                                                                    <button
                                                                                        className="file-action-btn approve"
                                                                                        onClick={() => handleApprove(file)}
                                                                                    >
                                                                                        Approve
                                                                                    </button>
                                                                                    <button
                                                                                        className="file-action-btn comment"
                                                                                        onClick={() => openCommentModal(file)}
                                                                                    >
                                                                                        Comment
                                                                                    </button>
                                                                                    <button
                                                                                        className="file-action-btn history"
                                                                                        onClick={() => handleViewActions(file)}
                                                                                    >
                                                                                        History
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="matrix-section todo-section">
                    <div className="matrix-header-bar">
                        <h3>📝 QC ToDo ({todoItems.length})</h3>
                    </div>
                    <div className="todo-list">
                        {todoItems.length === 0 ? (
                            <p className="todo-empty">No commented files yet.</p>
                        ) : (
                            todoItems.map((todo) => (
                                <div key={todo.qc_id || todo.file_id || `${todo.filename}-${todo.created_at}`} className="todo-item" onClick={() => openTodoModal(todo)}>
                                    <div className="todo-main">
                                        <span className="todo-file">{todo.filename}</span>
                                        <span className="todo-path">{todo.path || 'Path unavailable'}</span>
                                    </div>
                                    <p className="todo-comment">{todo.comment}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Rejection Modal */}
            {showReuploadModal && selectedFile && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h3>Comment on File</h3>
                            <button
                                className="modal-close"
                                onClick={() => {
                                    setShowReuploadModal(false)
                                    setLoadingCommentHistory(false)
                                }}
                            >
                                ✕
                            </button>
                        </div>
                        <div className="modal-content">
                            <p><strong>File:</strong> {selectedFile.filename}</p>
                            <textarea
                                placeholder="Enter QC comment..."
                                value={rejectComment}
                                onChange={(e) => setRejectComment(e.target.value)}
                                rows="5"
                                className="reject-textarea"
                            />
                            <div className="comments-section previous-comments">
                                <span className="info-label">Previous Comments</span>
                                {loadingCommentHistory ? (
                                    <p className="no-actions">Loading comment history...</p>
                                ) : fileActions.filter((action) => action.comment).length === 0 ? (
                                    <p className="no-actions">No previous comments</p>
                                ) : (
                                    <div className="actions-list">
                                        {fileActions
                                            .filter((action) => action.comment)
                                            .map((action) => (
                                                <div key={action.id} className="action-item">
                                                    <div className="action-header">
                                                        <span className="action-type">{(action.action_type || 'comment').toUpperCase()}</span>
                                                        <span className="action-user">{action.user_email}</span>
                                                        <span className="action-date">{new Date(action.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                    <p className="action-comment">{action.comment}</p>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn-cancel"
                                onClick={() => {
                                    setShowReuploadModal(false)
                                    setLoadingCommentHistory(false)
                                }}
                            >
                                Cancel
                            </button>
                            <button className="btn-reject" onClick={() => handleReject(selectedFile)}>Save Comment</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Actions History Modal */}
            {showActionsModal && selectedFile && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h3>Approval History</h3>
                            <button className="modal-close" onClick={() => setShowActionsModal(false)}>✕</button>
                        </div>
                        <div className="modal-content">
                            <p><strong>File:</strong> {selectedFile.filename}</p>
                            <div className="actions-list">
                                {fileActions.length === 0 ? (
                                    <p className="no-actions">No actions recorded yet</p>
                                ) : (
                                    fileActions.map((action) => (
                                        <div key={action.id} className="action-item">
                                            <div className="action-header">
                                                <span className="action-type">{action.action_type.toUpperCase()}</span>
                                                <span className="action-user">{action.user_email}</span>
                                                <span className="action-date">{new Date(action.created_at).toLocaleDateString()}</span>
                                            </div>
                                            {action.comment && <p className="action-comment">{action.comment}</p>}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-cancel" onClick={() => setShowActionsModal(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* QC ToDo Details Modal */}
            {showTodoModal && selectedTodo && (
                <div className="modal-overlay">
                    <div className="modal todo-detail-modal">
                        <div className="modal-header">
                            <h3>QC ToDo Detail</h3>
                            <button
                                className="modal-close"
                                onClick={() => {
                                    setShowTodoModal(false)
                                    setSelectedTodo(null)
                                    setReuploadFile(null)
                                    setReuploadResult(null)
                                    setConfirmDelete(false)
                                }}
                            >
                                ✕
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="file-info-section">
                                <h4>File Information</h4>
                                <div className="info-grid">
                                    <div className="info-item">
                                        <span className="info-label">File</span>
                                        <span className="info-value">{selectedTodo.filename}</span>
                                    </div>
                                    <div className="info-item">
                                        <span className="info-label">Path</span>
                                        <span className="info-value">{selectedTodo.path || 'Path unavailable'}</span>
                                    </div>
                                </div>
                                <div className="comments-section">
                                    <span className="info-label">File Path</span>
                                    <div className="todo-detail-path-box">{selectedTodo.path || 'Path unavailable'}</div>
                                </div>

                                <div className="comments-section">
                                    <span className="info-label">Latest Comment</span>
                                    <div className="comment-box">{selectedTodo.comment}</div>
                                </div>
                                {selectedTodo.web_view_link && (
                                    <div className="file-link-section">
                                        <a
                                            href={selectedTodo.web_view_link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="file-link"
                                        >
                                            Open Current File in Drive
                                        </a>
                                    </div>
                                )}
                            </div>

                            <div className="file-info-section">
                                <h4>History</h4>
                                {fileActions.length === 0 ? (
                                    <p className="no-actions">No actions recorded yet</p>
                                ) : (
                                    <div className="actions-list">
                                        {fileActions.map((action) => (
                                            <div key={action.id} className="action-item">
                                                <div className="action-header">
                                                    <span className="action-type">{action.action_type.toUpperCase()}</span>
                                                    <span className="action-user">{action.user_email}</span>
                                                    <span className="action-date">{new Date(action.created_at).toLocaleDateString()}</span>
                                                </div>
                                                {action.comment && <p className="action-comment">{action.comment}</p>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="reupload-form">
                                <h4>Reupload File</h4>
                                <div className="form-group">
                                    <label htmlFor="reupload-filename">Filename</label>
                                    <input
                                        id="reupload-filename"
                                        className="form-input"
                                        value={reuploadFilename}
                                        readOnly
                                        placeholder="Enter filename to upload"
                                    />
                                    <p className="form-hint">
                                        Filename is locked to the original so path/validation logic stays consistent.
                                    </p>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="reupload-file">Choose File</label>
                                    <input
                                        id="reupload-file"
                                        type="file"
                                        className="form-input-file"
                                        onChange={(e) => setReuploadFile(e.target.files?.[0] || null)}
                                    />
                                </div>

                                {reuploadResult && (
                                    <div className={`reupload-result ${reuploadResult.success ? 'success' : 'error'}`}>
                                        <p>{reuploadResult.message}</p>
                                        {reuploadResult.link && (
                                            <a href={reuploadResult.link} target="_blank" rel="noopener noreferrer" className="file-link">
                                                Open in Drive
                                            </a>
                                        )}
                                    </div>
                                )}

                                <div className="form-actions">
                                    {confirmDelete && (
                                        <p className="delete-warning-text">
                                            Click &quot;Confirm Delete&quot; to permanently remove this file from Google Drive.
                                        </p>
                                    )}
                                    <button
                                        className="btn-delete-file"
                                        onClick={handleTodoDelete}
                                        disabled={reuploading || deletingFile || (!selectedTodo?.file_id && !selectedTodo?.live_file_id)}
                                    >
                                        {deletingFile ? 'Deleting...' : (confirmDelete ? 'Confirm Delete' : 'Delete File')}
                                    </button>
                                    <button
                                        className="btn-cancel"
                                        onClick={() => {
                                            setShowTodoModal(false)
                                            setSelectedTodo(null)
                                            setReuploadFile(null)
                                            setReuploadResult(null)
                                            setConfirmDelete(false)
                                        }}
                                        disabled={reuploading || deletingFile}
                                    >
                                        Close
                                    </button>
                                    <button
                                        className="btn-submit"
                                        onClick={handleTodoReupload}
                                        disabled={reuploading || deletingFile}
                                    >
                                        {reuploading ? 'Uploading...' : 'Reupload'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default QCMatrix
