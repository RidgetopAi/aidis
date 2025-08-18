import React, { useState, useEffect } from 'react';
import {
  Drawer,
  Typography,
  Space,
  Button,
  Card,
  Tag,
  Divider,
  Form,
  Input,
  Select,
  message,
  Modal,
  Descriptions,
  Timeline,
  Alert,
  Spin
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  ShareAltOutlined,
  SaveOutlined,
  CloseOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CalendarOutlined,
  UserOutlined,
  FolderOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { TechnicalDecision } from './types';
import { DecisionApi } from '../../services/decisionApi';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface DecisionDetailProps {
  visible: boolean;
  decision: TechnicalDecision | null;
  onClose: () => void;
  onUpdate?: (decision: TechnicalDecision) => void;
  onDelete?: (decision: TechnicalDecision) => void;
}

const DecisionDetail: React.FC<DecisionDetailProps> = ({
  visible,
  decision,
  onClose,
  onUpdate,
  onDelete
}) => {
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (decision && visible) {
      form.setFieldsValue({
        outcome: decision.outcome || '',
        lessons: decision.lessons || '',
        status: decision.status
      });
      setEditMode(false);
    }
  }, [decision, visible, form]);

  if (!decision) {
    return null;
  }

  const handleEdit = () => {
    setEditMode(true);
  };

  const handleCancel = () => {
    setEditMode(false);
    form.setFieldsValue({
      outcome: decision.outcome || '',
      lessons: decision.lessons || '',
      status: decision.status
    });
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();
      const updatedDecision = await DecisionApi.updateDecision(decision.id, values);
      
      message.success('Decision updated successfully');
      onUpdate?.(updatedDecision);
      setEditMode(false);
    } catch (error) {
      console.error('Failed to update decision:', error);
      message.error('Failed to update decision');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Modal.confirm({
      title: 'Delete Technical Decision',
      content: 'Are you sure you want to delete this decision? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => onDelete?.(decision)
    });
  };

  const handleShare = () => {
    const shareData = {
      title: `Technical Decision: ${decision.title}`,
      text: `Problem: ${decision.problem}\n\nDecision: ${decision.decision}`,
      url: window.location.href
    };

    if (navigator.share) {
      navigator.share(shareData).catch(console.error);
    } else {
      navigator.clipboard.writeText(shareData.text);
      message.success('Decision details copied to clipboard');
    }
  };

  const statusColor = DecisionApi.getStatusColor(decision.status);
  const statusDisplayName = DecisionApi.getStatusDisplayName(decision.status);
  const priority = DecisionApi.getDecisionPriority(decision);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'rejected':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'proposed':
        return <ExclamationCircleOutlined style={{ color: '#1890ff' }} />;
      default:
        return <BulbOutlined style={{ color: '#fa8c16' }} />;
    }
  };

  const timelineData = [
    {
      color: statusColor,
      icon: getStatusIcon(decision.status),
      children: (
        <div>
          <Text strong>Decision {statusDisplayName}</Text>
          <br />
          <Text type="secondary">{dayjs(decision.created_at).format('MMMM D, YYYY [at] h:mm A')}</Text>
          {decision.created_by && (
            <>
              <br />
              <Text type="secondary">by {decision.created_by}</Text>
            </>
          )}
        </div>
      )
    }
  ];

  if (decision.updated_at !== decision.created_at) {
    timelineData.unshift({
      color: '#1890ff',
      icon: <EditOutlined />,
      children: (
        <div>
          <Text strong>Decision Updated</Text>
          <br />
          <Text type="secondary">{dayjs(decision.updated_at).format('MMMM D, YYYY [at] h:mm A')}</Text>
          {decision.updated_by && (
            <>
              <br />
              <Text type="secondary">by {decision.updated_by}</Text>
            </>
          )}
        </div>
      )
    });
  }

  return (
    <Drawer
      title={
        <Space>
          {getStatusIcon(decision.status)}
          <span>{decision.title}</span>
        </Space>
      }
      placement="right"
      closable={true}
      onClose={onClose}
      open={visible}
      width={720}
      extra={
        <Space>
          {!editMode ? (
            <>
              <Button
                icon={<ShareAltOutlined />}
                onClick={handleShare}
              >
                Share
              </Button>
              <Button
                icon={<EditOutlined />}
                onClick={handleEdit}
              >
                Edit
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleDelete}
              >
                Delete
              </Button>
            </>
          ) : (
            <>
              <Button
                icon={<CloseOutlined />}
                onClick={handleCancel}
              >
                Cancel
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={loading}
                onClick={handleSave}
              >
                Save
              </Button>
            </>
          )}
        </Space>
      }
    >
      <Spin spinning={loading}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* Status and Metadata */}
          <Card size="small">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Status">
                <Space>
                  <Tag color={statusColor}>
                    {statusDisplayName}
                  </Tag>
                  {priority !== 'low' && (
                    <Tag color={priority === 'high' ? 'red' : 'orange'}>
                      {priority.toUpperCase()} PRIORITY
                    </Tag>
                  )}
                </Space>
              </Descriptions.Item>
              {decision.project_name && (
                <Descriptions.Item label="Project">
                  <Space>
                    <FolderOutlined />
                    {decision.project_name}
                  </Space>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Created">
                <Space>
                  <CalendarOutlined />
                  {dayjs(decision.created_at).format('MMMM D, YYYY [at] h:mm A')}
                  {decision.created_by && (
                    <>
                      <UserOutlined />
                      {decision.created_by}
                    </>
                  )}
                </Space>
              </Descriptions.Item>
              {decision.updated_at !== decision.created_at && (
                <Descriptions.Item label="Last Updated">
                  <Space>
                    <CalendarOutlined />
                    {dayjs(decision.updated_at).format('MMMM D, YYYY [at] h:mm A')}
                    {decision.updated_by && (
                      <>
                        <UserOutlined />
                        {decision.updated_by}
                      </>
                    )}
                  </Space>
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>

          {/* Problem */}
          <Card title="Problem Statement" size="small">
            <Paragraph>
              {decision.problem}
            </Paragraph>
          </Card>

          {/* Decision */}
          <Card title="Decision Made" size="small">
            <Paragraph>
              {decision.decision}
            </Paragraph>
          </Card>

          {/* Rationale */}
          {decision.rationale && (
            <Card title="Rationale" size="small">
              <Paragraph>
                {decision.rationale}
              </Paragraph>
            </Card>
          )}

          {/* Alternatives */}
          {decision.alternatives && decision.alternatives.length > 0 && (
            <Card title="Alternatives Considered" size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                {decision.alternatives.map((alternative, index) => (
                  <div key={index}>
                    <Space>
                      <BulbOutlined style={{ color: '#fa8c16' }} />
                      <Text strong>Alternative {index + 1}:</Text>
                    </Space>
                    <Paragraph style={{ marginLeft: 24, marginTop: 4 }}>
                      {alternative}
                    </Paragraph>
                  </div>
                ))}
              </Space>
            </Card>
          )}

          {/* Editable Sections */}
          {editMode ? (
            <Form form={form} layout="vertical">
              <Card title="Update Decision" size="small">
                <Form.Item 
                  name="status" 
                  label="Status"
                  rules={[{ required: true, message: 'Please select a status' }]}
                >
                  <Select>
                    <Select.Option value="proposed">Proposed</Select.Option>
                    <Select.Option value="accepted">Accepted</Select.Option>
                    <Select.Option value="rejected">Rejected</Select.Option>
                    <Select.Option value="superseded">Superseded</Select.Option>
                    <Select.Option value="deprecated">Deprecated</Select.Option>
                  </Select>
                </Form.Item>

                <Form.Item 
                  name="outcome" 
                  label="Outcome"
                  help="Document the actual results of implementing this decision"
                >
                  <TextArea
                    rows={4}
                    placeholder="Describe what happened after implementing this decision..."
                  />
                </Form.Item>

                <Form.Item 
                  name="lessons" 
                  label="Lessons Learned"
                  help="What would you do differently next time?"
                >
                  <TextArea
                    rows={4}
                    placeholder="Document key insights and lessons learned..."
                  />
                </Form.Item>
              </Card>
            </Form>
          ) : (
            <>
              {/* Outcome */}
              {decision.outcome ? (
                <Card title="Outcome" size="small">
                  <Paragraph>
                    {decision.outcome}
                  </Paragraph>
                </Card>
              ) : decision.status === 'accepted' && (
                <Alert
                  type="warning"
                  message="Outcome Documentation Pending"
                  description="This decision has been accepted but the outcome has not been documented yet. Consider adding the results of implementing this decision."
                  showIcon
                />
              )}

              {/* Lessons Learned */}
              {decision.lessons && (
                <Card title="Lessons Learned" size="small">
                  <Paragraph>
                    {decision.lessons}
                  </Paragraph>
                </Card>
              )}
            </>
          )}

          {/* Timeline */}
          <Card title="Decision Timeline" size="small">
            <Timeline items={timelineData} />
          </Card>
        </Space>
      </Spin>
    </Drawer>
  );
};

export default DecisionDetail;
