export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkReleases(env));
  },

  async fetch(request, env, ctx) {
    await checkReleases(env);
    return new Response("Check completed successfully!", { status: 200 });
  },
};

async function checkReleases(env) {
  const repo = "MetrolistGroup/Metrolist";
  const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;

  try {
    const response = await fetch(apiUrl, {
      headers: { "User-Agent": "CloudflareWorker-ReleaseNotifier" },
    });

    if (!response.ok) return;

    const release = await response.json();
    const latestTag = release.tag_name;
    const releaseUrl = release.html_url;

    const lastSeenTag = await env.METROLIST_KV.get("LAST_TAG");

    if (latestTag !== lastSeenTag) {
      const assets = release.assets || [];
      const apkAsset =
        assets.find((a) => a.name === "Metrolist.apk") ||
        assets.find((a) => a.name.endsWith(".apk"));

      const caption =
        `New Metrolist APK Available\n\n` +
        `Version: ${latestTag}\n` +
        `Link: ${releaseUrl}`;

      if (apkAsset) {
        const success = await sendTelegramDocument(
          env,
          apkAsset.browser_download_url,
          apkAsset.name,
          caption,
        );

        if (success) {
          await env.METROLIST_KV.put("LAST_TAG", latestTag);
        }
      } else {
        await sendTelegramMessage(
          env,
          `${caption}\n\nNote: No APK file was found attached to this release.`,
        );
        await env.METROLIST_KV.put("LAST_TAG", latestTag);
      }
    }
  } catch (err) {
    console.error("Error checking release:", err);
  }
}

async function sendTelegramDocument(env, fileUrl, fileName, caption) {
  const telegramUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`;

  const apkResponse = await fetch(fileUrl, {
    headers: { "User-Agent": "CloudflareWorker-ReleaseNotifier" },
  });

  if (!apkResponse.ok) return false;

  const blob = await apkResponse.blob();

  const formData = new FormData();
  formData.append("chat_id", env.TELEGRAM_CHAT_ID);
  formData.append("document", blob, fileName);
  formData.append("caption", caption);

  const res = await fetch(telegramUrl, {
    method: "POST",
    body: formData,
  });

  return res.ok;
}

async function sendTelegramMessage(env, message) {
  const telegramUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(telegramUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: message,
    }),
  });
}
