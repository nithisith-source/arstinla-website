function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",
        "cache-control":
          "no-store"
      }
    }
  );
}


export async function onRequestGet({
  request,
  env
}) {

  try {

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
            "Project gallery is unavailable"
        },
        503
      );
    }

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
          headers: {
            Authorization:
              `Bearer ${token}`,
            Accept:
              "application/vnd.github+json",
            "X-GitHub-Api-Version":
              "2022-11-28",
            "User-Agent":
              "ARSTINLA-Website"
          }
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
      return json(
        {
          ok: false,
          error:
            "Project gallery is unavailable"
        },
        502
      );
    }

    const items =
      await response.json();

    const files =
      Array.isArray(items)
        ? items
            .filter(
              item =>
                item &&
                item.type === "file" &&
                /\.(jpe?g|png|webp|gif)$/i
                  .test(item.name)
            )
            .sort(
              (left, right) =>
                String(left.name)
                  .localeCompare(
                    String(right.name),
                    undefined,
                    { numeric: true }
                  )
            )
            .map(
              item => ({
                name:
                  item.name,
                path:
                  `/assets/project-${projectNumber}/${item.name}`
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
          "Project gallery is unavailable"
      },
      500
    );
  }
}
