/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    // 权限检查：仅站长可以拉取配置订阅
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (authInfo.username !== process.env.USERNAME) {
      return NextResponse.json(
        { error: '权限不足，只有站长可以拉取配置订阅' },
        { status: 401 }
      );
    }

    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: '缺少URL参数' }, { status: 400 });
    }

    // 直接 fetch URL 获取配置内容
    const response = await fetch(url);

    if (!response.ok) {
      return NextResponse.json(
        { error: `请求失败: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const configContent = await response.text();

    const trimmedContent = configContent.trim();
    let decodedContent = '';

    // 1. 如果本身已经是合法的 JSON 字符串，直接使用
    let isDirectJson = false;
    try {
      JSON.parse(trimmedContent);
      isDirectJson = true;
      decodedContent = trimmedContent;
    } catch {
      isDirectJson = false;
    }

    // 2. 若非直接 JSON，尝试 Base58 解码（兼容 LunaTV 原生 Base58 订阅格式）
    if (!isDirectJson) {
      try {
        const bs58 = (await import('bs58')).default;
        const decodedBytes = bs58.decode(trimmedContent);
        const candidate = new TextDecoder().decode(decodedBytes);
        JSON.parse(candidate);
        decodedContent = candidate;
      } catch (decodeError) {
        // 3. 若 Base58 失败，尝试 Base64 解码兜底
        try {
          const base64Candidate = Buffer.from(trimmedContent, 'base64').toString('utf8');
          JSON.parse(base64Candidate);
          decodedContent = base64Candidate;
        } catch {
          // 4. 若无法解码为有效 JSON，若原始文本包含大括号则尝试原样传递由配置校验器处理
          if (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) {
            decodedContent = trimmedContent;
          } else {
            console.warn('订阅内容解码失败，非有效 JSON / Base58 / Base64', decodeError);
            throw new Error('订阅内容格式不支持，请确保为标准 JSON 或 Base58 订阅文本');
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      configContent: decodedContent,
      message: '配置拉取成功'
    });

  } catch (error) {
    console.error('拉取配置失败:', error);
    return NextResponse.json(
      { error: '拉取配置失败' },
      { status: 500 }
    );
  }
}
