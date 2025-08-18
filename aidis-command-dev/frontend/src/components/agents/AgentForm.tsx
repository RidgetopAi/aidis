import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Space,
  message,
  Divider,
  Tag
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Agent, CreateAgentRequest, UpdateAgentRequest } from '../../services/agentApi';

const { TextArea } = Input;
const { Option } = Select;

interface AgentFormProps {
  visible: boolean;
  agent?: Agent;
  onSubmit: (data: CreateAgentRequest | UpdateAgentRequest) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

const AGENT_TYPES = [
  { value: 'ai_assistant', label: 'AI Assistant' },
  { value: 'code_reviewer', label: 'Code Reviewer' },
  { value: 'tester', label: 'Tester' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'security_auditor', label: 'Security Auditor' }
];

const DEFAULT_CAPABILITIES = [
  'coding',
  'testing',
  'review',
  'debugging',
  'documentation',
  'planning',
  'architecture',
  'security',
  'optimization',
  'deployment'
];

const AgentForm: React.FC<AgentFormProps> = ({
  visible,
  agent,
  onSubmit,
  onCancel,
  loading
}) => {
  const [form] = Form.useForm();
  const [customCapability, setCustomCapability] = useState('');
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);

  const isEditing = !!agent;

  useEffect(() => {
    if (visible) {
      if (agent) {
        // Editing mode - populate form with agent data
        form.setFieldsValue({
          name: agent.name,
          type: agent.type,
          capabilities: agent.capabilities || [],
          status: agent.status
        });
        setSelectedCapabilities(agent.capabilities || []);
      } else {
        // Creating mode - reset form
        form.resetFields();
        form.setFieldsValue({
          type: 'ai_assistant',
          capabilities: ['coding']
        });
        setSelectedCapabilities(['coding']);
      }
    }
  }, [visible, agent, form]);

  const handleSubmit = async (values: any) => {
    try {
      const formData = {
        ...values,
        capabilities: selectedCapabilities,
        metadata: values.metadata ? JSON.parse(values.metadata) : {}
      };

      await onSubmit(formData);
      form.resetFields();
      setSelectedCapabilities([]);
    } catch (error) {
      console.error('Form submission error:', error);
      message.error('Please check your input and try again');
    }
  };

  const handleAddCapability = () => {
    if (customCapability && !selectedCapabilities.includes(customCapability)) {
      const newCapabilities = [...selectedCapabilities, customCapability];
      setSelectedCapabilities(newCapabilities);
      form.setFieldValue('capabilities', newCapabilities);
      setCustomCapability('');
    }
  };

  const handleRemoveCapability = (capability: string) => {
    const newCapabilities = selectedCapabilities.filter(cap => cap !== capability);
    setSelectedCapabilities(newCapabilities);
    form.setFieldValue('capabilities', newCapabilities);
  };

  const handleCapabilitySelect = (value: string) => {
    if (!selectedCapabilities.includes(value)) {
      const newCapabilities = [...selectedCapabilities, value];
      setSelectedCapabilities(newCapabilities);
      form.setFieldValue('capabilities', newCapabilities);
    }
  };

  return (
    <Modal
      title={isEditing ? 'Edit Agent' : 'Register New Agent'}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={600}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          type: 'ai_assistant',
          capabilities: ['coding']
        }}
      >
        {/* Basic Information */}
        <Form.Item
          name="name"
          label="Agent Name"
          rules={[
            { required: true, message: 'Please enter agent name' },
            { min: 2, message: 'Agent name must be at least 2 characters' },
            { max: 50, message: 'Agent name must be less than 50 characters' }
          ]}
        >
          <Input placeholder="Enter agent name (e.g., CodeReviewer-Alpha)" />
        </Form.Item>

        <Form.Item
          name="type"
          label="Agent Type"
          rules={[{ required: true, message: 'Please select agent type' }]}
        >
          <Select placeholder="Select agent type">
            {AGENT_TYPES.map(type => (
              <Option key={type.value} value={type.value}>
                {type.label}
              </Option>
            ))}
          </Select>
        </Form.Item>

        {/* Status (only for editing) */}
        {isEditing && (
          <Form.Item
            name="status"
            label="Status"
            rules={[{ required: true, message: 'Please select agent status' }]}
          >
            <Select>
              <Option value="active">Active</Option>
              <Option value="busy">Busy</Option>
              <Option value="offline">Offline</Option>
              <Option value="error">Error</Option>
            </Select>
          </Form.Item>
        )}

        {/* Capabilities */}
        <Form.Item label="Capabilities">
          <div style={{ marginBottom: 8 }}>
            <Space wrap>
              {selectedCapabilities.map(capability => (
                <Tag
                  key={capability}
                  closable
                  onClose={() => handleRemoveCapability(capability)}
                  color="blue"
                >
                  {capability}
                </Tag>
              ))}
            </Space>
          </div>

          <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
            <Select
              placeholder="Add predefined capability"
              style={{ flex: 1 }}
              onChange={handleCapabilitySelect}
              value={null}
            >
              {DEFAULT_CAPABILITIES
                .filter(cap => !selectedCapabilities.includes(cap))
                .map(capability => (
                  <Option key={capability} value={capability}>
                    {capability}
                  </Option>
                ))}
            </Select>
          </Space.Compact>

          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="Or enter custom capability"
              value={customCapability}
              onChange={(e) => setCustomCapability(e.target.value)}
              onPressEnter={handleAddCapability}
              style={{ flex: 1 }}
            />
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={handleAddCapability}
              disabled={!customCapability || selectedCapabilities.includes(customCapability)}
            >
              Add
            </Button>
          </Space.Compact>
        </Form.Item>

        {/* Metadata */}
        <Form.Item
          name="metadata"
          label="Metadata (JSON)"
          help="Optional JSON configuration for the agent"
        >
          <TextArea
            rows={3}
            placeholder='{"version": "1.0", "model": "gpt-4"}'
          />
        </Form.Item>

        <Divider />

        {/* Form Actions */}
        <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
          <Space>
            <Button onClick={onCancel}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              {isEditing ? 'Update Agent' : 'Register Agent'}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default AgentForm;
