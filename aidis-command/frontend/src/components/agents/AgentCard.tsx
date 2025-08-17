import React from 'react';
import { Card, Tag, Space, Avatar, Tooltip, Typography } from 'antd';
import { 
  EditOutlined, 
  DeleteOutlined, 
  EyeOutlined, 
  RobotOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  MinusCircleOutlined
} from '@ant-design/icons';
import { Agent } from '../../services/agentApi';

const { Text } = Typography;

interface AgentCardProps {
  agent: Agent;
  onEdit: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
  onView: (agent: Agent) => void;
}

const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  onEdit,
  onDelete,
  onView
}) => {
  const getStatusIcon = (status: Agent['status']) => {
    switch (status) {
      case 'active':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'busy':
        return <ClockCircleOutlined style={{ color: '#faad14' }} />;
      case 'error':
        return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'offline':
      default:
        return <MinusCircleOutlined style={{ color: '#8c8c8c' }} />;
    }
  };

  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'active': return 'success';
      case 'busy': return 'warning';
      case 'error': return 'error';
      case 'offline': return 'default';
      default: return 'default';
    }
  };

  const formatLastSeen = (lastSeen: string) => {
    const now = new Date();
    const then = new Date(lastSeen);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'ai_assistant': return 'blue';
      case 'code_reviewer': return 'purple';
      case 'tester': return 'green';
      case 'project_manager': return 'orange';
      default: return 'default';
    }
  };

  return (
    <Card
      size="small"
      hoverable
      style={{ height: '100%', cursor: 'default' }}
      bodyStyle={{ padding: '16px' }}
      actions={[
        <Tooltip title="View Details" key="view">
          <EyeOutlined onClick={() => onView(agent)} />
        </Tooltip>,
        <Tooltip title="Edit Agent" key="edit">
          <EditOutlined onClick={() => onEdit(agent)} />
        </Tooltip>,
        <Tooltip title="Delete Agent" key="delete">
          <DeleteOutlined onClick={() => onDelete(agent)} />
        </Tooltip>
      ]}
    >
      {/* Agent Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 12 }}>
        <Avatar 
          icon={<RobotOutlined />} 
          style={{ 
            backgroundColor: agent.status === 'active' ? '#52c41a' : '#8c8c8c',
            marginRight: 12,
            flexShrink: 0
          }} 
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            <Text strong style={{ fontSize: '16px', marginRight: 8 }}>
              {agent.name}
            </Text>
            {getStatusIcon(agent.status)}
          </div>
          <Space size="small">
            <Tag color={getTypeColor(agent.type)}>{agent.type.replace('_', ' ')}</Tag>
            <Tag color={getStatusColor(agent.status)}>{agent.status}</Tag>
          </Space>
        </div>
      </div>

      {/* Agent Statistics */}
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text type="secondary">Sessions:</Text>
          <Text strong>{agent.session_count || 0}</Text>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text type="secondary">Active Tasks:</Text>
          <Text strong color={agent.active_tasks && agent.active_tasks > 0 ? 'orange' : undefined}>
            {agent.active_tasks || 0}
          </Text>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text type="secondary">Last Seen:</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {formatLastSeen(agent.last_seen)}
          </Text>
        </div>
      </Space>

      {/* Capabilities */}
      {agent.capabilities && agent.capabilities.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 4 }}>
            Capabilities:
          </Text>
          <Space size={4} wrap>
            {agent.capabilities.map(cap => (
              <Tag key={cap} color="geekblue">
                {cap}
              </Tag>
            ))}
          </Space>
        </div>
      )}

      {/* Metadata */}
      {agent.metadata && Object.keys(agent.metadata).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            Additional Info
          </Text>
          <div style={{ fontSize: '11px', color: '#8c8c8c', marginTop: 2 }}>
            {Object.keys(agent.metadata).length} metadata fields
          </div>
        </div>
      )}
    </Card>
  );
};

export default AgentCard;
