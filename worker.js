/**
 * Cloudflare Worker 入口文件。
 * 包含 'scheduled' 和 'fetch' 两个处理器。
 */

// --------------------------------------------------------------------------
// 1. 核心逻辑函数：执行 API 调用
// --------------------------------------------------------------------------

/**
 * 执行订阅额度重置的 API 调用。
 * * @param {object} env 环境变量对象，包含 MY_AUTH_TOKEN。
 * @returns {Promise<void>}
 * @throws {Error} 如果 API 调用失败（非 2xx 响应或网络错误）。
 */
async function resetCredits(env) {
  // **重要：** 确保您已经在 Cloudflare Worker 界面或使用 Wrangler 配置了名为 MY_AUTH_TOKEN 和 SUB_ID 的 Secret。
  const authToken = env.MY_AUTH_TOKEN;
  const subscriptionId = env.SUB_ID;

  if (!authToken || !subscriptionId) {
      throw new Error("environment variable is not set. Cannot proceed with API call.");
  }
  
  const url = "https://www.88code.org/api/reset-credits/" + subscriptionId;
  
  // API 请求选项
  const fetchOptions = {
      method: "POST",
      headers: {
          "Accept": "application/json, text/plain, */*",
          // 使用环境变量中的 Token
          "Authorization": `Bearer ${authToken}`, 
          "Content-Type": "application/json",
          // 浏览器特定的 Headers 在这里被移除，以保持简洁和标准
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      // body: "null" 是正确的 JSON null 字符串表示
      body: "null", 
  };

  console.log("Attempting to reset subscription credits...");

  try {
      const apiResponse = await fetch(url, fetchOptions);
      
      if (!apiResponse.ok) {
          // API 返回非成功状态码 (例如 401, 404, 500)
          const errorText = await apiResponse.text();
          console.error(`API call failed with status: ${apiResponse.status}`);
          console.error('API Error Response:', errorText);
          // 抛出错误以通知 Cloudflare 定时任务失败
          throw new Error(`API call failed with status ${apiResponse.status}. Response: ${errorText.substring(0, 100)}`);
      }
      
      // API 调用成功
      // const data = await apiResponse.json(); // 如果需要解析响应数据
      console.log("Subscription credits reset successfully (Status: 2xx).");
      
  } catch (error) {
      // 网络错误或 DNS 查找失败等
      console.error("Fatal error during credit reset operation:", error);
      throw error; // 重新抛出错误
  }
}

// --------------------------------------------------------------------------
// 2. Worker 处理器导出
// --------------------------------------------------------------------------

export default {
  /**
   * 处理器：处理由 Cron Trigger 触发的定时任务
   * * @param {ScheduledEvent} event Cloudflare 提供的定时事件对象。
   * @param {object} env 环境变量对象。
   * @param {ExecutionContext} ctx 执行上下文。
   */
  async scheduled(event, env, ctx) {
      // 使用 ctx.waitUntil 确保异步操作在 Worker 终止前完成，
      // 即使 scheduled 函数已经返回。
      ctx.waitUntil(
          // 调用核心逻辑
          resetCredits(env).catch(e => {
              // 捕获并记录错误，防止 Worker 默默失败
              console.error("Scheduled task failed to execute or complete:", e.message);
              // 这里不需要再次抛出，因为我们只是在记录，
              // 真正的失败会在 resetCredits 内部记录和抛出。
          })
      );
  },

  /**
   * 处理器：处理由 HTTP 请求触发的事件 (可选，但推荐保留)
   * * @param {Request} request 传入的 HTTP 请求对象。
   * @param {object} env 环境变量对象。
   * @param {ExecutionContext} ctx 执行上下文。
   * @returns {Response}
   */
  async fetch(request, env, ctx) {
      // 您可以添加一个逻辑，允许通过访问 Worker URL 来手动触发重置：
      if (new URL(request.url).pathname === '/manual-reset' && request.method === 'POST') {
          try {
              // 执行重置操作，并等待其完成
              await resetCredits(env);
              return new Response(JSON.stringify({ status: "success", message: "Credits manually reset successfully." }), { 
                  status: 200, 
                  headers: { "Content-Type": "application/json" } 
              });
          } catch (error) {
              return new Response(JSON.stringify({ status: "error", message: `Manual reset failed: ${error.message}` }), { 
                  status: 500, 
                  headers: { "Content-Type": "application/json" } 
              });
          }
      }
      
      // 默认响应：告知用户 Worker 状态
      return new Response("Subscription Reset Worker is active. Scheduled handler is configured. Use /manual-reset POST to trigger manually.", {
          status: 200,
          headers: { "Content-Type": "text/plain" }
      });
  }
};