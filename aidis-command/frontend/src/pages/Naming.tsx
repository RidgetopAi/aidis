import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography, Space, Row, Col, Card, List, Pagination, Spin, 
  message, Button, Modal, Divider, Empty, Alert
} from 'antd';
import {
  CodeOutlined, SearchOutlined, ReloadOutlined,
  EyeOutlined, FilterOutlined, BarChartOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { useNamingStore, useNamingSearch, useNamingSelection } from '../stores/namingStore';
import { NamingApi } from '../services/namingApi';
import NamingCard from '../components/naming/NamingCard';
import NamingFilters from '../components/naming/NamingFilters';
import NamingDetail from '../components/naming/NamingDetail';
import NamingRegister from '../components/naming/NamingRegister';

const { Title, Text } = Typography;

const Naming: React.FC = () => {
  const {
    searchResults,
    currentEntry,
    stats,
    isLoading,
    isSearching,
    error,
    showDetail,
    showFilters,
    showRegister,
    setSearchResults,
    setStats,
    setCurrentEntry,
    setLoading,
    setSearching,
    setError,
    setShowDetail,
    setShowFilters,
    setShowRegister,
    clearError,
    addSelectedEntry,
    removeSelectedEntry,
    selectAllEntries,
    clearSelection
  } = useNamingStore();

  const { 
    searchParams, 
    updateSearchParam, 
    isFiltered 
  } = useNamingSearch();

  const namingSelection = useNamingSelection();
  const [showStatsModal, setShowStatsModal] = useState(false);

  // Load entries on component mount and when search params change
  useEffect(() => {
    loadEntries();
    loadStats();
  }, []);

  const loadEntries = useCallback(async () => {
    setSearching(true);
    setError(null);
    
    try {
      const result = await NamingApi.searchEntries(searchParams);
      setSearchResults(result);
    } catch (err) {
      console.error('Failed to load naming entries:', err);
      setError('Failed to load naming entries. Please try again.');
      message.error('Failed to load naming entries');
    } finally {
      setSearching(false);
    }
  }, [searchParams, setSearchResults, setSearching, setError]);

  const loadStats = async () => {
    try {
      const namingStats = await NamingApi.getNamingStats();
      setStats(namingStats);
    } catch (err) {
      console.error('Failed to load naming stats:', err);
    }
  };

  const handleSearch = useCallback(() => {
    loadEntries();
  }, [loadEntries]);

  const handleRefresh = () => {
    clearSelection();
    loadEntries();
    loadStats();
  };

  const handleEntrySelect = (id: number, selected: boolean) => {
    if (selected) {
      addSelectedEntry(id);
    } else {
      removeSelectedEntry(id);
    }
  };

  const handleSelectAll = (allSelected: boolean) => {
    if (allSelected) {
      selectAllEntries();
    } else {
      clearSelection();
    }
  };

  const handleEntryView = (entry: any) => {
    setCurrentEntry(entry);
    setShowDetail(true);
  };

  const handleEntryEdit = (entry: any) => {
    setCurrentEntry(entry);
    setShowDetail(true);
  };

  const handleEntryDelete = async (entry: any) => {
    Modal.confirm({
      title: 'Delete Naming Entry',
      content: 'Are you sure you want to delete this naming entry? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await NamingApi.deleteEntry(entry.id);
          message.success('Naming entry deleted successfully');
          loadEntries(); // Refresh the list
        } catch (err) {
          console.error('Failed to delete naming entry:', err);
          message.error('Failed to delete naming entry');
        }
      }
    });
  };

  const handleEntryShare = (entry: any) => {
    const shareData = {
      title: `AIDIS Naming Entry: ${entry.name}`,
      text: `Name: ${entry.name}\nType: ${entry.type}\nCompliance: ${entry.compliance_score}%`,
      url: window.location.href
    };

    if (navigator.share) {
      navigator.share(shareData).catch(console.error);
    } else {
      navigator.clipboard.writeText(shareData.text);
      message.success('Naming entry details copied to clipboard');
    }
  };

  const handleEntryUpdate = (updatedEntry: any) => {
    // Update the entry in the search results
    if (searchResults) {
      const updatedEntries = searchResults.entries.map(entry =>
        entry.id === updatedEntry.id ? updatedEntry : entry
      );
      setSearchResults({
        ...searchResults,
        entries: updatedEntries
      });
    }
  };

  const handleRegisterComplete = (newEntry: any) => {
    setShowRegister(false);
    message.success('Name registered successfully');
    loadEntries(); // Refresh the list
    loadStats(); // Update stats
  };

  const handlePaginationChange = (page: number, pageSize?: number) => {
    const newOffset = (page - 1) * (pageSize || searchParams.limit || 20);
    updateSearchParam('offset', newOffset);
    if (pageSize && pageSize !== searchParams.limit) {
      updateSearchParam('limit', pageSize);
    }
    handleSearch();
  };

  const entries = searchResults?.entries || [];
  const total = searchResults?.total || 0;
  const currentPage = searchResults ? Math.floor((searchParams.offset || 0) / (searchParams.limit || 20)) + 1 : 1;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            <CodeOutlined /> Naming Registry Browser
          </Title>
          <Text type="secondary">
            Manage naming consistency and prevent conflicts across your projects
          </Text>
        </div>
        
        <Space>
          <Button
            icon={<PlusOutlined />}
            type="primary"
            onClick={() => setShowRegister(true)}
          >
            Register Name
          </Button>
          <Button
            icon={<BarChartOutlined />}
            onClick={() => setShowStatsModal(true)}
          >
            Statistics
          </Button>
          <Button
            icon={<FilterOutlined />}
            onClick={() => setShowFilters(!showFilters)}
            type={showFilters ? 'primary' : 'default'}
          >
            {showFilters ? 'Hide' : 'Show'} Filters
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={isLoading || isSearching}
          >
            Refresh
          </Button>
        </Space>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          closable
          onClose={clearError}
        />
      )}

      <Row gutter={24}>
        {/* Filters Sidebar */}
        {showFilters && (
          <Col span={6}>
            <NamingFilters
              onSearch={handleSearch}
              loading={isSearching}
            />
          </Col>
        )}

        {/* Main Content */}
        <Col span={showFilters ? 18 : 24}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {/* Results Header */}
            <Card size="small">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <SearchOutlined />
                  <Text strong>
                    {isSearching ? 'Searching...' : `${total} names found`}
                  </Text>
                  {isFiltered && (
                    <Text type="secondary">(filtered)</Text>
                  )}
                </Space>
                
                <Space>
                  {total > 0 && (
                    <Text type="secondary">
                      Showing {Math.min(entries.length, total)} of {total}
                    </Text>
                  )}
                </Space>
              </div>
            </Card>

            {/* Naming List */}
            <div style={{ minHeight: '400px' }}>
              <Spin spinning={isSearching}>
                {entries.length > 0 ? (
                  <List
                    grid={{
                      gutter: 16,
                      xs: 1,
                      sm: 1,
                      md: 1,
                      lg: 2,
                      xl: 2,
                      xxl: 3,
                    }}
                    dataSource={entries}
                    renderItem={(entry) => (
                      <List.Item>
                        <NamingCard
                          entry={entry}
                          selected={namingSelection.selectedEntries.includes(entry.id)}
                          showCheckbox={true}
                          searchTerm={searchParams.query}
                          onSelect={handleEntrySelect}
                          onView={handleEntryView}
                          onEdit={handleEntryEdit}
                          onDelete={handleEntryDelete}
                          onShare={handleEntryShare}
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <Card>
                    <Empty
                      image={<CodeOutlined style={{ fontSize: '64px', color: '#d9d9d9' }} />}
                      imageStyle={{ height: 80 }}
                      description={
                        <Space direction="vertical">
                          <Text>
                            {isFiltered ? 'No names match your filters' : 'No names found in registry'}
                          </Text>
                          <Text type="secondary">
                            {isFiltered 
                              ? 'Try adjusting your search criteria or clearing filters'
                              : 'Names will appear here as they are registered'
                            }
                          </Text>
                        </Space>
                      }
                    >
                      {isFiltered ? (
                        <Button 
                          type="primary" 
                          onClick={() => {
                            updateSearchParam('query', undefined);
                            updateSearchParam('type', undefined);
                            updateSearchParam('status', undefined);
                            updateSearchParam('project_id', undefined);
                            updateSearchParam('created_by', undefined);
                            updateSearchParam('date_from', undefined);
                            updateSearchParam('date_to', undefined);
                            handleSearch();
                          }}
                        >
                          Clear Filters
                        </Button>
                      ) : (
                        <Button 
                          type="primary" 
                          icon={<PlusOutlined />}
                          onClick={() => setShowRegister(true)}
                        >
                          Register First Name
                        </Button>
                      )}
                    </Empty>
                  </Card>
                )}
              </Spin>
            </div>

            {/* Pagination */}
            {total > (searchParams.limit || 20) && (
              <div style={{ textAlign: 'center', marginTop: 24 }}>
                <Pagination
                  current={currentPage}
                  total={total}
                  pageSize={searchParams.limit || 20}
                  showSizeChanger
                  showQuickJumper
                  showTotal={(total, range) =>
                    `${range[0]}-${range[1]} of ${total} names`
                  }
                  onChange={handlePaginationChange}
                  pageSizeOptions={['10', '20', '50', '100']}
                />
              </div>
            )}
          </Space>
        </Col>
      </Row>

      {/* Naming Detail Drawer */}
      <NamingDetail
        visible={showDetail}
        entry={currentEntry}
        onClose={() => setShowDetail(false)}
        onUpdate={handleEntryUpdate}
        onDelete={(entry) => {
          setShowDetail(false);
          loadEntries();
        }}
      />

      {/* Register Name Modal */}
      <NamingRegister
        visible={showRegister}
        onClose={() => setShowRegister(false)}
        onComplete={handleRegisterComplete}
      />

      {/* Statistics Modal */}
      <Modal
        title={
          <Space>
            <BarChartOutlined />
            <span>Naming Registry Statistics</span>
          </Space>
        }
        open={showStatsModal}
        onCancel={() => setShowStatsModal(false)}
        footer={null}
        width={800}
      >
        {stats && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Card title="Overview">
              <Row gutter={16}>
                <Col span={6}>
                  <div style={{ textAlign: 'center' }}>
                    <Text type="secondary">Total Names</Text>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
                      {stats.total_names}
                    </div>
                  </div>
                </Col>
                <Col span={6}>
                  <div style={{ textAlign: 'center' }}>
                    <Text type="secondary">Compliance</Text>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#52c41a' }}>
                      {stats.compliance}%
                    </div>
                  </div>
                </Col>
                <Col span={6}>
                  <div style={{ textAlign: 'center' }}>
                    <Text type="secondary">Recent Activity</Text>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fa8c16' }}>
                      {stats.recent_activity}
                    </div>
                  </div>
                </Col>
                <Col span={6}>
                  <div style={{ textAlign: 'center' }}>
                    <Text type="secondary">Projects</Text>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#722ed1' }}>
                      {stats.total_projects}
                    </div>
                  </div>
                </Col>
              </Row>
            </Card>

            <Card title="By Type">
              <Space direction="vertical" style={{ width: '100%' }}>
                {Object.entries(stats.by_type).map(([type, count]) => (
                  <div key={type} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Space>
                      <div 
                        style={{ 
                          width: 8, 
                          height: 8, 
                          borderRadius: '50%', 
                          backgroundColor: NamingApi.getTypeColor(type)
                        }} 
                      />
                      <Text>{NamingApi.getTypeDisplayName(type)}</Text>
                    </Space>
                    <Text strong>{count}</Text>
                  </div>
                ))}
              </Space>
            </Card>

            <Card title="By Status">
              <Space direction="vertical" style={{ width: '100%' }}>
                {Object.entries(stats.by_status).map(([status, count]) => (
                  <div key={status} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Space>
                      <div 
                        style={{ 
                          width: 8, 
                          height: 8, 
                          borderRadius: '50%', 
                          backgroundColor: NamingApi.getStatusColor(status)
                        }} 
                      />
                      <Text>{NamingApi.getStatusDisplayName(status)}</Text>
                    </Space>
                    <Text strong>{count}</Text>
                  </div>
                ))}
              </Space>
            </Card>
          </Space>
        )}
      </Modal>
    </Space>
  );
};

export default Naming;
