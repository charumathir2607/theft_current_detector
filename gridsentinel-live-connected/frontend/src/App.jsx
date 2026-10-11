import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import LiveGridSentinel from './LiveGridSentinel.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LiveGridSentinel page="overview" />} />
        <Route path="/telemetry" element={<LiveGridSentinel page="telemetry" />} />
        <Route path="/alerts" element={<LiveGridSentinel page="alerts" />} />
        <Route path="/setup" element={<LiveGridSentinel page="setup" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
