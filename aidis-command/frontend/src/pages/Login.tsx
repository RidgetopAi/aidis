import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, Space, Alert } from 'antd';
import { UserOutlined, LockOutlined, DatabaseOutlined } from '@ant-design/icons';
import { useAuthContext } from '../contexts/AuthContext';
import { LoginRequest } from '../services/api';

const { Title, Text } = Typography;

interface LocationState {
  from: {
    pathname: string;
  };
}

const Login: React.FC = () => {
  const { isAuthenticated, isLoading, error, login, clearError } = useAuthContext();
  const location = useLocation();
  const [form] = Form.useForm();

  // Clear any existing errors when component mounts
  useEffect(() => {
    clearError();
  }, [clearError]);

  // Redirect if already authenticated
  if (isAuthenticated) {
    const from = (location.state as LocationState)?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (values: LoginRequest) => {
    try {
      await login(values);
    } catch (error) {
      // Error handling is done in AuthContext
      console.error('Login failed:', error);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '20px',
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}
        bodyStyle={{ padding: '40px' }}
      >
        <Space
          direction="vertical"
          size="large"
          style={{ width: '100%', textAlign: 'center' }}
        >
          {/* AIDIS Logo and Title */}
          <Space direction="vertical" size="small">
            <DatabaseOutlined
              style={{
                fontSize: '48px',
                color: '#1890ff',
                marginBottom: '8px',
              }}
            />
            <Title level={2} style={{ margin: 0, color: '#1890ff' }}>
              AIDIS Command
            </Title>
            <Text type="secondary">
              Database Management & Admin Tool
            </Text>
          </Space>

          {/* Error Alert */}
          {error && (
            <Alert
              message="Login Failed"
              description={error}
              type="error"
              showIcon
              closable
              onClose={clearError}
            />
          )}

          {/* Login Form */}
          <Form
            form={form}
            name="login"
            onFinish={handleSubmit}
            autoComplete="off"
            size="large"
            style={{ width: '100%' }}
            initialValues={{ username: 'admin' }} // Pre-fill for demo
          >
            <Form.Item
              name="username"
              rules={[
                { required: true, message: 'Please enter your username!' },
                { min: 3, message: 'Username must be at least 3 characters' },
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="Username"
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: 'Please enter your password!' },
                { min: 6, message: 'Password must be at least 6 characters' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Password"
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: '16px' }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={isLoading}
                style={{ width: '100%' }}
              >
                {isLoading ? 'Signing In...' : 'Sign In'}
              </Button>
            </Form.Item>
          </Form>

          {/* Demo Credentials */}
          <div
            style={{
              backgroundColor: '#f6f6f6',
              padding: '12px',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          >
            <Text strong>Demo Credentials:</Text>
            <br />
            <Text type="secondary">Username: admin</Text>
            <br />
            <Text type="secondary">Password: admin123!</Text>
          </div>

          {/* Footer */}
          <Text type="secondary" style={{ fontSize: '12px' }}>
            AIDIS Command ©2025 - AI Development Intelligence System
          </Text>
        </Space>
      </Card>
    </div>
  );
};

export default Login;
