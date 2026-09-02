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
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        i,
        i + chunkSize
      )
    );
  }

  return btoa(binary);
}


function cleanFileName(name) {
  return String(name || "image.jpg")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");
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


    const owner =
      env.GITHUB_OWNER;

    const repo =
      env.GITHUB_REPO;

    const branch =
      env.GITHUB_BRANCH || "main";

    const token =
      env.GITHUB_TOKEN;


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


    const githubHeaders = {
      Authorization:
        `Bearer ${token}`,

      Accept:
        "application/vnd.github+json",

      "X-GitHub-Api-Version":
        "2022-11-28",

      "User-Agent":
        "ARSTINLA-Project-Manager"
    };


    const formData =
      await request.formData();

    const projectNumber =
      String(
        formData.get("projectNumber") || ""
      ).trim();


    if (!/^\d{2}$/.test(projectNumber)) {
      return json(
        {
          ok: false,
          error:
            "Invalid project number"
        },
        400
      );
    }


    const uploadedFiles =
      formData.getAll("files")
        .filter(
          file =>
            file instanceof File &&
            file.size > 0
        );


    if (!uploadedFiles.length) {
      return json(
        {
          ok: false,
          error:
            "No images selected"
        },
        400
      );
    }


    const uploaded = [];


    for (const file of uploadedFiles) {

      const fileName =
        cleanFileName(file.name);

      const githubPath =
        `assets/project-${projectNumber}/${fileName}`;

      const apiUrl =
        `https://api.github.com/repos/` +
        `${owner}/${repo}/contents/` +
        `${githubPath}`;


      let existingSha = null;

      const existingResponse =
        await fetch(
          `${apiUrl}?ref=${encodeURIComponent(branch)}`,
          {
            headers: githubHeaders
          }
        );


      if (existingResponse.ok) {

        const existing =
          await existingResponse.json();

        existingSha =
          existing.sha;
      }


      const bytes =
        new Uint8Array(
          await file.arrayBuffer()
        );


      const payload = {
        message:
          `Upload Project ${projectNumber} image: ${fileName}`,

        content:
          bytesToBase64(bytes),

        branch
      };


      if (existingSha) {
        payload.sha =
          existingSha;
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

            body:
              JSON.stringify(payload)
          }
        );


      if (!uploadResponse.ok) {

        const details =
          await uploadResponse.text();

        return json(
          {
            ok: false,
            error:
              `Upload failed: ${fileName}`,
            details
          },
          500
        );
      }


      uploaded.push(
        `/assets/project-${projectNumber}/${fileName}`
      );
    }


    return json({
      ok: true,
      projectNumber,
      uploaded
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
export async function onRequestGet({
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

    const url =
      new URL(request.url);

    const projectNumber =
      String(
        url.searchParams.get(
          "projectNumber"
        ) || ""
      ).trim();

    if (!/^\d{2}$/.test(projectNumber)) {
      return json(
        {
          ok: false,
          error:
            "Invalid project number"
        },
        400
      );
    }

    const owner =
      env.GITHUB_OWNER;

    const repo =
      env.GITHUB_REPO;

    const branch =
      env.GITHUB_BRANCH || "main";

    const token =
      env.GITHUB_TOKEN;

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

    const githubHeaders = {
      Authorization:
        `Bearer ${token}`,

      Accept:
        "application/vnd.github+json",

      "X-GitHub-Api-Version":
        "2022-11-28",

      "User-Agent":
        "ARSTINLA-Project-Manager"
    };

    const folderPath =
      `assets/project-${projectNumber}`;

    const apiUrl =
      `https://api.github.com/repos/` +
      `${owner}/${repo}/contents/` +
      `${folderPath}` +
      `?ref=${encodeURIComponent(branch)}`;

    const response =
      await fetch(
        apiUrl,
        {
          headers:
            githubHeaders
        }
      );

    if (response.status === 404) {
      return json({
        ok: true,
        projectNumber,
        files: []
      });
    }

    if (!response.ok) {

      const details =
        await response.text();

      return json(
        {
          ok: false,
          error:
            "Cannot read project folder",
          details
        },
        500
      );
    }

    const items =
      await response.json();

    const files =
      Array.isArray(items)
        ? items
            .filter(
              item =>
                item.type === "file"
            )
            .filter(
              item =>
                /\.(jpe?g|png|webp|gif)$/i
                  .test(item.name)
            )
            .map(
              item => ({
                name:
                  item.name,

                path:
                  `/assets/project-${projectNumber}/${item.name}`,

                sha:
                  item.sha
              })
            )
        : [];

    return json({
      ok: true,
      projectNumber,
      files
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
