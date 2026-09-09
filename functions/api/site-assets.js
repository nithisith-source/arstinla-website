function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8"
      }
    }
  );
}


function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (
    let index = 0;
    index < bytes.length;
    index += chunkSize
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        index,
        index + chunkSize
      )
    );
  }

  return btoa(binary);
}


export async function onRequestPost({
  request,
  env
}) {
  try {
    const adminKey =
      request.headers.get(
        "x-admin-key"
      );

    if (
      !env.ADMIN_KEY ||
      adminKey !== env.ADMIN_KEY
    ) {
      return json(
        {
          ok: false,
          error: "Unauthorized"
        },
        401
      );
    }

    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch =
      env.GITHUB_BRANCH || "main";
    const token = env.GITHUB_TOKEN;

    if (!owner || !repo || !token) {
      return json(
        {
          ok: false,
          error:
            "GitHub environment variables missing"
        },
        500
      );
    }

    const formData =
      await request.formData();

    const hero =
      formData.get("hero");

    if (
      !(hero instanceof File) ||
      hero.size === 0
    ) {
      return json(
        {
          ok: false,
          error: "No hero image selected"
        },
        400
      );
    }

    if (hero.type !== "image/jpeg") {
      return json(
        {
          ok: false,
          error:
            "Home Hero must be a JPG image"
        },
        400
      );
    }

    if (
      hero.size >
        15 * 1024 * 1024
    ) {
      return json(
        {
          ok: false,
          error:
            "Home Hero must not exceed 15 MB"
        },
        400
      );
    }

    const githubHeaders = {
      Authorization: `Bearer ${token}`,
      Accept:
        "application/vnd.github+json",
      "X-GitHub-Api-Version":
        "2022-11-28",
      "User-Agent":
        "ARSTINLA-Project-Manager"
    };

    const githubPath =
      "assets/hero.jpg";

    const apiUrl =
      `https://api.github.com/repos/` +
      `${owner}/${repo}/contents/` +
      githubPath;

    const existingResponse =
      await fetch(
        `${apiUrl}?ref=${encodeURIComponent(branch)}`,
        {
          headers: githubHeaders
        }
      );

    let existingSha = null;

    if (existingResponse.ok) {
      const existing =
        await existingResponse.json();

      existingSha = existing.sha;
    }
    else if (
      existingResponse.status !== 404
    ) {
      return json(
        {
          ok: false,
          error:
            "Cannot read the current Home Hero"
        },
        500
      );
    }

    const bytes =
      new Uint8Array(
        await hero.arrayBuffer()
      );

    const payload = {
      message: "Update Home Hero image",
      content: bytesToBase64(bytes),
      branch
    };

    if (existingSha) {
      payload.sha = existingSha;
    }

    const uploadResponse =
      await fetch(
        apiUrl,
        {
          method: "PUT",
          headers: {
            ...githubHeaders,
            "content-type":
              "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

    if (!uploadResponse.ok) {
      const details =
        await uploadResponse.text();

      return json(
        {
          ok: false,
          error:
            "Home Hero upload failed",
          details
        },
        500
      );
    }

    return json({
      ok: true,
      path: "/assets/hero.jpg"
    });
  }
  catch (error) {
    return json(
      {
        ok: false,
        error:
          error?.message ||
          "Unknown error"
      },
      500
    );
  }
}
