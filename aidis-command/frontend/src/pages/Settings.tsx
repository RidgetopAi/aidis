import React from 'react';
import { Typography, Card, Form, Input, Switch, Button, Space, Divider } from 'antd';
import { SettingOutlined, UserOutlined, BellOutlined, SecurityScanOutlined } from '@ant-design/icons';
import { useAuthContext } from '../contexts/AuthContext';

const { Title, Text } = Typography;

const Settings: React.FC = () => {
  const { user } = useAuthContext();
  const [form] = Form.useForm();

  const handleSave = (values: any) => {
    console.log('Settings saved:', values);
    // TODO: Implement settings save
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div>
        <Title level={2}>Settings</Title>
        <Text type="secondary">
          Manage your account settings and preferences
        </Text>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        initialValues={{
          username: user?.username,
          email: user?.email,
          firstName: user?.firstName,
          lastName: user?.lastName,
          notifications: true,
          darkMode: false,
          autoSave: true,
        }}
      >
        {/* Profile Settings */}
        <Card title={<><UserOutlined /> Profile Information</>}>
          <Form.Item
            label="Username"
            name="username"
            rules={[{ required: true, message: 'Username is required' }]}
          >
            <Input placeholder="Enter your username" />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Email is required' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input placeholder="Enter your email" />
          </Form.Item>

          <Form.Item label="First Name" name="firstName">
            <Input placeholder="Enter your first name" />
          </Form.Item>

          <Form.Item label="Last Name" name="lastName">
            <Input placeholder="Enter your last name" />
          </Form.Item>
        </Card>

        {/* Notification Settings */}
        <Card title={<><BellOutlined /> Notifications</>}>
          <Form.Item
            label="Enable Notifications"
            name="notifications"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Text type="secondary">
            Receive notifications about system updates and important events
          </Text>
        </Card>

        {/* Application Settings */}
        <Card title={<><SettingOutlined /> Application Preferences</>}>
          <Form.Item
            label="Dark Mode"
            name="darkMode"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item
            label="Auto-save Context"
            name="autoSave"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Text type="secondary">
            Automatically save context changes without manual confirmation
          </Text>
        </Card>

        {/* Security Settings */}
        <Card title={<><SecurityScanOutlined /> Security</>}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button type="default">Change Password</Button>
            <Button type="default">Manage API Keys</Button>
            <Button type="default" danger>
              Revoke All Sessions
            </Button>
          </Space>
        </Card>

        <Divider />

        {/* Action Buttons */}
        <Space>
          <Button type="primary" htmlType="submit">
            Save Changes
          </Button>
          <Button type="default" onClick={() => form.resetFields()}>
            Reset
          </Button>
        </Space>
      </Form>
    </Space>
  );
};

export default Settings;
